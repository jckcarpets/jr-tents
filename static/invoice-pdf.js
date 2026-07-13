// ---------------------------------------------------------------------------
// Minimal self-contained PDF invoice generator (no external libraries).
// Builds a valid single/multi-page PDF using the built-in Helvetica fonts and
// triggers a direct file download — no print dialog involved.
// ---------------------------------------------------------------------------

(function () {
  const PAGE_W = 595.28;   // A4 portrait, points
  const PAGE_H = 841.89;
  const MARGIN = 40;

  const BLUE = [0.114, 0.306, 0.847];   // #1d4ed8
  const DARK = [0.11, 0.11, 0.11];
  const GRAY = [0.42, 0.45, 0.5];
  const LIGHT_LINE = [0.85, 0.88, 0.95];

  // Accurate-enough text measurement via canvas (browser Helvetica/Arial
  // metrics match PDF base-14 Helvetica very closely).
  const _canvas = document.createElement('canvas');
  const _ctx = _canvas.getContext('2d');
  function textWidth(str, size, bold) {
    _ctx.font = (bold ? 'bold ' : '') + size + 'px Helvetica, Arial, sans-serif';
    return _ctx.measureText(String(str)).width;
  }

  // Escape a JS string into a WinAnsi PDF string literal
  function pdfEscape(str) {
    let out = '';
    for (const ch of String(str)) {
      let code = ch.charCodeAt(0);
      if (code > 255) code = 63; // '?' for anything beyond WinAnsi
      if (code === 40 || code === 41 || code === 92) out += '\\' + ch;
      else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
      else out += String.fromCharCode(code);
    }
    return out;
  }

  function PdfDoc() {
    this.pages = [];      // each: array of content-stream ops
    this.current = null;
    this.logo = null;     // {bytes: Uint8Array (JPEG), w, h} — optional
    this.newPage();
  }

  // Draw the registered logo image with its top-left corner at (x, yTop)
  PdfDoc.prototype.drawLogo = function (x, yTop, wPt, hPt) {
    const py = PAGE_H - yTop - hPt;
    this.current.push(
      'q ' + wPt.toFixed(2) + ' 0 0 ' + hPt.toFixed(2) + ' ' +
      x.toFixed(2) + ' ' + py.toFixed(2) + ' cm /Im1 Do Q'
    );
  };

  PdfDoc.prototype.newPage = function () {
    this.current = [];
    this.pages.push(this.current);
  };

  // y is measured from the TOP of the page for convenience
  PdfDoc.prototype.text = function (x, yTop, str, size, opts) {
    opts = opts || {};
    const y = PAGE_H - yTop;
    const font = opts.bold ? '/F2' : '/F1';
    const c = opts.color || DARK;
    let tx = x;
    if (opts.align === 'right') tx = x - textWidth(str, size, opts.bold);
    else if (opts.align === 'center') tx = x - textWidth(str, size, opts.bold) / 2;
    this.current.push(
      'BT ' + c.map(n => n.toFixed(3)).join(' ') + ' rg ' + font + ' ' + size +
      ' Tf ' + tx.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + pdfEscape(str) + ') Tj ET'
    );
  };

  PdfDoc.prototype.rect = function (x, yTop, w, h, color) {
    const y = PAGE_H - yTop - h;
    this.current.push(
      color.map(n => n.toFixed(3)).join(' ') + ' rg ' +
      x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f'
    );
  };

  PdfDoc.prototype.line = function (x1, yTop, x2, width, color) {
    const y = PAGE_H - yTop;
    this.current.push(
      color.map(n => n.toFixed(3)).join(' ') + ' RG ' + width + ' w ' +
      x1.toFixed(2) + ' ' + y.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y.toFixed(2) + ' l S'
    );
  };

  PdfDoc.prototype.build = function () {
    const enc = new TextEncoder();
    const hasLogo = !!this.logo;
    const pageCount = this.pages.length;

    // Object layout: 1 Catalog, 2 Pages, 3 F1, 4 F2, [5 Im1],
    // then per page i: Page, Contents
    const firstPageObj = hasLogo ? 6 : 5;
    const objects = [];   // each entry: string OR {head, bytes, tail}

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const kids = [];
    for (let i = 0; i < pageCount; i++) kids.push((firstPageObj + i * 2) + ' 0 R');
    objects.push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    if (hasLogo) {
      objects.push({
        head: '<< /Type /XObject /Subtype /Image /Width ' + this.logo.w +
              ' /Height ' + this.logo.h +
              ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
              this.logo.bytes.length + ' >>\nstream\n',
        bytes: this.logo.bytes,
        tail: '\nendstream',
      });
    }

    const resources = '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
      (hasLogo ? ' /XObject << /Im1 5 0 R >>' : '') + ' >>';

    this.pages.forEach((ops, i) => {
      const contentRef = (firstPageObj + i * 2 + 1);
      objects.push(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] ' +
        resources + ' /Contents ' + contentRef + ' 0 R >>'
      );
      const stream = ops.join('\n');
      const streamBytes = enc.encode(stream);
      objects.push('<< /Length ' + streamBytes.length + ' >>\nstream\n' + stream + '\nendstream');
    });

    // Assemble with byte-accurate offsets (streams may be binary)
    const parts = [];
    let offset = 0;
    function push(x) {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      parts.push(b);
      offset += b.length;
    }

    push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    const offsets = [0];
    objects.forEach((body, idx) => {
      offsets.push(offset);
      push((idx + 1) + ' 0 obj\n');
      if (typeof body === 'string') {
        push(body);
      } else {
        push(body.head);
        push(body.bytes);
        push(body.tail);
      }
      push('\nendobj\n');
    });
    const xrefPos = offset;
    let xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
      xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref + 'trailer\n<< /Size ' + (objects.length + 1) +
         ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');

    const total = new Uint8Array(offset);
    let pos = 0;
    parts.forEach(p => { total.set(p, pos); pos += p.length; });
    return total;
  };

  // Load static/logo.png (if present) and convert to JPEG bytes for the PDF
  async function loadLogo() {
    try {
      const resp = await fetch('static/logo.png', { cache: 'no-store' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const cx = canvas.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.drawImage(bmp, 0, 0);
      const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes: bytes, w: bmp.width, h: bmp.height };
    } catch (e) {
      return null;
    }
  }

  // ---------------- Invoice layout ----------------

  window.downloadInvoicePDF = async function (ev, formatMoney, formatDateRange) {
    const currency = ev.discount_currency || 'UGX';
    const t = ev.totals || { subtotal: 0, tax_amount: 0, discount_amount: 0, total: 0 };
    const products = ev.products || [];
    const code = ev.code || String(ev.id);

    const doc = new PdfDoc();
    doc.logo = await loadLogo();
    let y = 58;

    // Header — logo image top-left (exact artwork from static/logo.png);
    // falls back to styled text if the file is missing.
    let leftBottom;
    if (doc.logo) {
      const logoW = 185;
      const logoH = logoW * (doc.logo.h / doc.logo.w);
      doc.drawLogo(MARGIN, 42, logoW, logoH);
      doc.text(MARGIN, 42 + logoH + 14, 'Next to Doctors Hospital, Ebb Road, Kampala', 9.5, { color: GRAY });
      leftBottom = 42 + logoH + 18;
    } else {
      doc.text(MARGIN, y, 'J&R TENTS', 26, { bold: true, color: BLUE });
      doc.text(MARGIN, y + 16, 'Next to Doctors Hospital, Ebb Road, Kampala', 9.5, { color: GRAY });
      doc.text(MARGIN, y + 29, 'Tel: 0752 522 799', 9.5, { color: GRAY });
      leftBottom = y + 45;
    }

    const R = PAGE_W - MARGIN;
    // Date the quotation is generated (today)
    const now = new Date();
    const todayStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    doc.text(R, y, 'QUOTATION', 24, { bold: true, color: BLUE, align: 'right' });
    doc.text(R, y + 16, 'Quotation #: ' + code, 9.5, { color: GRAY, align: 'right' });
    doc.text(R, y + 29, 'Date: ' + todayStr, 9.5, { color: GRAY, align: 'right' });
    doc.text(R, y + 42, 'Event date: ' + formatDateRange(ev), 9.5, { color: GRAY, align: 'right' });
    let metaY = y + 55;
    if (ev.category) {
      doc.text(R, metaY, 'Category: ' + ev.category, 9.5, { color: GRAY, align: 'right' });
      metaY += 13;
    }
    doc.text(R, metaY, 'Classification: ' + (ev.classification || 'retail').toUpperCase(), 9.5, { color: GRAY, align: 'right' });

    y = Math.max(leftBottom, metaY) + 14;
    doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 2.2, BLUE);
    y += 24;

    // Billed to
    doc.text(MARGIN, y, 'BILLED TO', 8.5, { bold: true, color: BLUE });
    y += 16;
    doc.text(MARGIN, y, ev.client_name || ev.title || '', 13, { bold: true });
    y += 15;
    if (ev.location) {
      doc.text(MARGIN, y, 'Event location: ' + ev.location, 9.5, { color: GRAY });
      y += 15;
    }
    y += 10;

    // Table columns (x positions; r = right-aligned edge)
    const cols = {
      product: MARGIN + 6,
      dims: 225,
      days: 330, qty: 385, unit: 470, amount: R - 6,
    };

    function tableHeader() {
      doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 20, BLUE);
      const hy = y + 14;
      const white = [1, 1, 1];
      doc.text(cols.product, hy, 'PRODUCT', 8.5, { bold: true, color: white });
      doc.text(cols.dims, hy, 'DIMENSIONS', 8.5, { bold: true, color: white });
      doc.text(cols.days, hy, 'DAYS', 8.5, { bold: true, color: white, align: 'right' });
      doc.text(cols.qty, hy, 'QTY', 8.5, { bold: true, color: white, align: 'right' });
      doc.text(cols.unit, hy, 'UNIT COST', 8.5, { bold: true, color: white, align: 'right' });
      doc.text(cols.amount, hy, 'AMOUNT', 8.5, { bold: true, color: white, align: 'right' });
      y += 20;
    }

    tableHeader();

    // Wrap text to fit a column width so long values never cross into the
    // neighbouring columns — they stack on extra lines instead.
    function wrapText(str, size, maxW) {
      const words = String(str || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      words.forEach(w => {
        const cand = cur ? cur + ' ' + w : w;
        if (!cur || textWidth(cand, size, false) <= maxW) cur = cand;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    }

    const titleMaxW = cols.dims - cols.product - 12;
    const dimsMaxW = 84;

    products.forEach(p => {
      const titleLines = wrapText(p.title || '', 9.5, titleMaxW);
      const dimLines = wrapText(p.dimensions || 'n/a', 9.5, dimsMaxW);
      const nLines = Math.max(titleLines.length, dimLines.length);
      const rowH = 9 + nLines * 12;

      if (y + rowH > PAGE_H - 150) {   // room for at least totals footer
        doc.newPage();
        y = 50;
        tableHeader();
      }
      const amount = (Number(p.days) || 0) * (Number(p.qty) || 0) * (Number(p.unit_price) || 0);
      const ry = y + 15;
      titleLines.forEach((ln, i) => doc.text(cols.product, ry + i * 12, ln, 9.5));
      dimLines.forEach((ln, i) => doc.text(cols.dims, ry + i * 12, ln, 9.5, { color: GRAY }));
      doc.text(cols.days, ry, String(p.days), 9.5, { align: 'right' });
      doc.text(cols.qty, ry, String(p.qty), 9.5, { align: 'right' });
      doc.text(cols.unit, ry, formatMoney(Number(p.unit_price) || 0), 9.5, { align: 'right' });
      doc.text(cols.amount, ry, formatMoney(amount), 9.5, { align: 'right' });
      y += rowH;
      doc.line(MARGIN, y, R, 0.5, LIGHT_LINE);
    });

    if (products.length === 0) {
      doc.text(cols.product, y + 15, 'No products on this event.', 9.5, { color: GRAY });
      y += 21;
    }

    // Totals
    if (y > PAGE_H - 170) { doc.newPage(); y = 50; }
    y += 12;
    const labelX = 400;
    const totals = [
      ['Sub Total', formatMoney(t.subtotal)],
      ['Tax', formatMoney(t.tax_amount)],
      ['Discount', formatMoney(t.discount_amount)],
    ];
    totals.forEach(([label, val]) => {
      doc.text(labelX, y, label, 9.5, { color: GRAY });
      doc.text(cols.amount, y, val, 9.5, { align: 'right' });
      y += 16;
    });
    y += 4;
    doc.line(labelX - 5, y - 10, R, 1.4, BLUE);
    y += 8;
    doc.text(labelX - 45, y, 'Amount Due', 12, { bold: true, color: BLUE });
    doc.text(cols.amount, y, formatMoney(t.total) + ' ' + currency, 12, { bold: true, color: BLUE, align: 'right' });

    // Footer
    y += 34;
    if (y > PAGE_H - 140) { doc.newPage(); y = 50; }
    doc.text(MARGIN, y, ev.tax_inclusive ? 'Prices are tax inclusive' : 'Prices are tax exclusive', 8.5, { color: GRAY });
    y += 20;
    doc.text(MARGIN, y, 'Thank you for your business!', 10, { bold: true, color: BLUE });

    // Payment terms & bank details
    y += 26;
    doc.text(MARGIN, y, 'Payment Terms: CASH ON DELIVERY', 9.5, { bold: true });
    y += 24;
    doc.text(MARGIN, y, 'BANK DETAILS', 8.5, { bold: true, color: BLUE });
    y += 14;
    doc.text(MARGIN, y, 'Centenary Bank', 9.5);
    y += 13;
    doc.text(MARGIN, y, 'A/C No. 3201497074', 9.5);
    y += 13;
    doc.text(MARGIN, y, 'NASSIMBWA JOYCE', 9.5);

    // Direct download
    const bytes = doc.build();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Quotation-' + code + '.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  };
})();
