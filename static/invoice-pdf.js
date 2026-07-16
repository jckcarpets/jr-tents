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

  const ADDRESS_LINES = [
    'P.O Box 119600',
    'Kampala, Uganda',
    "Seguku, Next to Doctor's Hospital",
    'Email: jroutdoorsug@gmail.com',
    'Website: www.jroutdoorsug.com',
  ];

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
    this.images = [];     // array of {bytes: Uint8Array (JPEG), w, h}
    this.newPage();
  }

  // Register an image; returns its 1-based index (used as /Im<index>)
  PdfDoc.prototype.addImage = function (img) {
    this.images.push(img);
    return this.images.length;
  };

  // Draw image #idx with its top-left corner at (x, yTop)
  PdfDoc.prototype.drawImage = function (idx, x, yTop, wPt, hPt) {
    const py = PAGE_H - yTop - hPt;
    this.current.push(
      'q ' + wPt.toFixed(2) + ' 0 0 ' + hPt.toFixed(2) + ' ' +
      x.toFixed(2) + ' ' + py.toFixed(2) + ' cm /Im' + idx + ' Do Q'
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
    const nImg = this.images.length;
    const pageCount = this.pages.length;

    // Object layout: 1 Catalog, 2 Pages, 3 F1, 4 F2, [images 5..(4+nImg)],
    // then per page i: Page, Contents
    const firstImgObj = 5;
    const firstPageObj = firstImgObj + nImg;
    const objects = [];   // each entry: string OR {head, bytes, tail}

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const kids = [];
    for (let i = 0; i < pageCount; i++) kids.push((firstPageObj + i * 2) + ' 0 R');
    objects.push('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    this.images.forEach(img => {
      objects.push({
        head: '<< /Type /XObject /Subtype /Image /Width ' + img.w +
              ' /Height ' + img.h +
              ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
              img.bytes.length + ' >>\nstream\n',
        bytes: img.bytes,
        tail: '\nendstream',
      });
    });

    let xobjects = '';
    for (let i = 0; i < nImg; i++) {
      xobjects += ' /Im' + (i + 1) + ' ' + (firstImgObj + i) + ' 0 R';
    }
    const resources = '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
      (nImg ? ' /XObject <<' + xobjects + ' >>' : '') + ' >>';

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

  // Load an image file (PNG/JPG) and convert to JPEG bytes for the PDF.
  // Returns { bytes, w, h } or null if the file is missing.
  async function loadImage(path) {
    try {
      const resp = await fetch(path, { cache: 'no-store' });
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
    const logoImg = await loadImage('static/logo.png');
    const iconTiktok = await loadImage('static/icon-tiktok.png');
    const iconInstagram = await loadImage('static/icon-instagram.png');
    const iconGlobe = await loadImage('static/icon-globe.png');
    const logoIdx = logoImg ? doc.addImage(logoImg) : 0;
    let y = 58;

    const R = PAGE_W - MARGIN;
    const now = new Date();
    const todayStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    // ---- RIGHT side: logo, with the address block stacked below it ----
    let rightBottom;
    let addrTop = 58;   // y where the address block starts (shared with left column)
    if (logoImg) {
      const logoW = 160;
      const logoH = logoW * (logoImg.h / logoImg.w);
      const logoX = R - logoW;             // logo right-aligned
      doc.drawImage(logoIdx, logoX, 42, logoW, logoH);
      addrTop = 42 + logoH + 14;
      let ly = addrTop;
      ADDRESS_LINES.forEach(line => {         // address left-aligned under logo
        doc.text(logoX, ly, line, 9, { color: GRAY });
        ly += 12;
      });
      rightBottom = ly - 6;
    } else {
      doc.text(R, 58, 'J&R TENTS', 26, { bold: true, color: BLUE, align: 'right' });
      addrTop = 58 + 16;
      let ly = addrTop;
      ADDRESS_LINES.forEach(line => {
        doc.text(R, ly, line, 9, { color: GRAY, align: 'right' });
        ly += 12;
      });
      rightBottom = ly - 6;
    }

    // ---- LEFT side: quotation details ----
    // Drop the QUOTATION heading down to share the last address line (Website).
    const metaTop = addrTop + (ADDRESS_LINES.length - 1) * 12;
    doc.text(MARGIN, metaTop, 'QUOTATION', 12, { bold: true, color: BLUE });

    // Two-column meta. Third item = true means the value (the number) is bold.
    const metaPairs = [
      ['Quotation #:', code, false],
      ['Date:', todayStr, true],
      ['Event date:', formatDateRange(ev), true],
    ];
    if (ev.category) metaPairs.push(['Category:', ev.category, false]);
    metaPairs.push(['Classification:', (ev.classification || 'retail').toUpperCase(), false]);

    // Value column: right-align labels to a divider, values left-aligned after.
    let widestLabel = 0;
    metaPairs.forEach(([l]) => { widestLabel = Math.max(widestLabel, textWidth(l, 9.5, false)); });
    const labelRight = MARGIN + widestLabel;
    const valueX = labelRight + 6;
    let metaY = metaTop + 16;
    metaPairs.forEach(([label, value, boldVal]) => {
      doc.text(labelRight, metaY, label, 9.5, { color: GRAY, align: 'right' });
      doc.text(valueX, metaY, String(value), 9.5, boldVal ? { bold: true, color: DARK } : { color: GRAY });
      metaY += 13;
    });

    y = Math.max(rightBottom, metaY) + 14;
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
    doc.text(cols.amount, y, formatMoney(t.total), 12, { bold: true, color: BLUE, align: 'right' });

    // Footer
    y += 34;
    if (y > PAGE_H - 230) { doc.newPage(); y = 50; }
    doc.text(MARGIN, y, ev.tax_inclusive ? 'Prices are tax inclusive' : 'Prices are tax exclusive', 8.5, { color: GRAY });
    y += 20;
    doc.text(MARGIN, y, 'Thank you for your business!', 10, { bold: true, color: BLUE });

    // Payment terms & bank details
    y += 26;
    doc.text(MARGIN, y, 'Payment Terms: 100% Cash before delivery', 9.5, { bold: true });
    doc.text(PAGE_W - MARGIN, y, 'Kind Note: Please make a deposit to secure your booking', 9.5, { bold: true, align: 'right' });
    y += 24;
    doc.text(MARGIN, y, 'BANK DETAILS', 8.5, { bold: true, color: BLUE });
    y += 14;
    doc.text(MARGIN, y, 'Centenary Bank', 9.5);
    y += 13;
    doc.text(MARGIN, y, 'A/C No. 3201497074', 9.5);
    y += 13;
    doc.text(MARGIN, y, 'NASSIMBWA JOYCE', 9.5);

    // Social handles with icons — all on one line, below the bank details
    y += 26;
    const iconSize = 13;
    const socials = [
      [iconTiktok, 'jrtentsuganda'],
      [iconInstagram, 'jr.tents'],
      [iconGlobe, 'www.jroutdoorsug.com'],
    ];
    let sx = MARGIN;
    socials.forEach(([icon, handle], i) => {
      if (icon) {
        const idx = doc.addImage(icon);
        doc.drawImage(idx, sx, y - 10, iconSize, iconSize);
      }
      const tx = sx + iconSize + 6;
      doc.text(tx, y, handle, 9.5);
      sx = tx + textWidth(handle, 9.5, false) + 22; // gap before next item
    });

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
