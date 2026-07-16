// ---------------- State ----------------

let clients = [];
let events = [];
let viewDate = new Date();      // month currently shown on the calendar
let calendarMode = 'month';     // 'month' | 'list'

const PALETTE = [
  { name: 'Orange', value: '#e8720c' },
  { name: 'Brown', value: '#78350f' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Indigo', value: '#4338ca' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Yellow', value: '#ca8a04' },
  { name: 'Dark Blue', value: '#1e3a8a' },
  { name: 'Sky Blue', value: '#0284c7' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Gray', value: '#4b5563' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Black', value: '#111827' },
];

const TAX_RATES = { no_tax: 0, vat18: 0.18 };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMoney(n) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ---------------- API helpers ----------------

async function api(path, options) {
  const res = await fetch(path, Object.assign({
    headers: { 'Content-Type': 'application/json' }
  }, options));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadAll() {
  [clients, events] = await Promise.all([
    api('/api/clients'),
    api('/api/events'),
  ]);
}

// ---------------- Toast ----------------

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ---------------- Navigation ----------------

function setActiveView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const item = document.querySelector(`.nav-item[data-view="${view}"]:not(.disabled)`);
  if (item) item.classList.add('active');

  if (view === 'clients') renderClientsTable();
  if (view === 'dashboard') renderDashboard();
  if (view === 'payments') renderPaymentsRegister();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.classList.contains('disabled')) {
      setActiveView('soon');
    } else {
      setActiveView(item.dataset.view);
    }
    if (isMobileLayout()) closeMobileSidebar();
  });
});

// ---------------- Sidebar: collapse (desktop) / pull-out drawer (mobile) ----------------

function isMobileLayout() {
  return window.matchMedia('(max-width: 800px)').matches;
}

function openMobileSidebar() {
  document.body.classList.add('sidebar-open');
  document.getElementById('sidebar-backdrop').classList.remove('hidden');
}

function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
  document.getElementById('sidebar-backdrop').classList.add('hidden');
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  if (isMobileLayout()) {
    openMobileSidebar();
  } else {
    document.body.classList.remove('sidebar-collapsed');
  }
});

document.getElementById('sidebar-min').addEventListener('click', () => {
  if (isMobileLayout()) {
    closeMobileSidebar();
  } else {
    document.body.classList.add('sidebar-collapsed');
  }
});

document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileSidebar);

// ---------------- Calendar rendering ----------------

function renderDashboard() {
  document.getElementById('month-label').textContent = `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  if (calendarMode === 'month') {
    document.getElementById('calendar-month').classList.remove('hidden');
    document.getElementById('calendar-list').classList.add('hidden');
    renderCalendarMonth();
  } else {
    document.getElementById('calendar-month').classList.add('hidden');
    document.getElementById('calendar-list').classList.remove('hidden');
    renderEventListView();
  }
}

function eventsForDate(iso) {
  return events.filter(e => {
    if (!e.end_date) return e.date === iso;
    return iso >= e.date && iso <= e.end_date;
  });
}

function renderCalendarMonth() {
  const container = document.getElementById('calendar-month');
  container.innerHTML = '';

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const headRow = document.createElement('div');
  headRow.className = 'cal-row';
  WEEKDAYS.forEach(w => {
    const cell = document.createElement('div');
    cell.className = 'cal-head';
    cell.textContent = w;
    headRow.appendChild(cell);
  });
  container.appendChild(headRow);

  const firstOfMonth = new Date(year, month, 1);
  const jsDay = firstOfMonth.getDay();
  const offset = (jsDay + 6) % 7; // 0 = Monday
  const gridStart = new Date(year, month, 1 - offset);

  const today = todayISO();

  for (let week = 0; week < 6; week++) {
    const row = document.createElement('div');
    row.className = 'cal-row';
    for (let d = 0; d < 7; d++) {
      const cellIndex = week * 7 + d;
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + cellIndex);
      const iso = toISO(cellDate);

      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      if (cellDate.getMonth() !== month) cell.classList.add('other-month');
      if (iso === today) cell.classList.add('today');

      const dateLabel = document.createElement('div');
      dateLabel.className = 'cal-date';
      dateLabel.textContent = cellDate.getDate();
      cell.appendChild(dateLabel);

      // Every event for the day renders directly — no cap, no "+N more"
      // click needed. A busy day's cell (and its whole week row, since
      // they share a CSS grid row) simply grows taller to fit them all;
      // quieter weeks stay compact. That's the one bit of layout movement
      // that's actually wanted: the row draws down to fit new entries
      // instead of hiding them behind a toggle.
      eventsForDate(iso).forEach(ev => {
        const pill = document.createElement('div');
        pill.className = 'event-pill';
        pill.style.background = ev.color || '#e0793d';
        pill.textContent = ev.code ? `${ev.title} - ${ev.code}` : ev.title;
        pill.title = pill.textContent;
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          openEventPopup(ev.id);
        });
        cell.appendChild(pill);
      });

      cell.addEventListener('click', () => openEventForm(null, iso));

      row.appendChild(cell);
    }
    container.appendChild(row);

    const lastCellDate = new Date(gridStart);
    lastCellDate.setDate(gridStart.getDate() + (week * 7 + 6));
    if (lastCellDate.getMonth() !== month && week >= 4) break;
  }
}

function renderEventListView() {
  const container = document.getElementById('calendar-list');
  container.innerHTML = '';

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthEvents = events
    .filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (monthEvents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No events this month.';
    container.appendChild(empty);
    return;
  }

  monthEvents.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'event-list-row';

    const dateEl = document.createElement('div');
    dateEl.className = 'event-list-date';
    dateEl.textContent = ev.date;

    const dot = document.createElement('div');
    dot.className = 'event-list-dot';
    dot.style.background = ev.color || '#e0793d';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'event-list-title';
    titleEl.textContent = ev.title;
    const codeEl = document.createElement('div');
    codeEl.className = 'event-list-code';
    codeEl.textContent = ev.code || '';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(codeEl);

    row.appendChild(dateEl);
    row.appendChild(dot);
    row.appendChild(titleWrap);

    row.addEventListener('click', () => openEventPopup(ev.id));
    container.appendChild(row);
  });
}

// =========================================================================
// Event quick-view popup + read-only detail page
// =========================================================================

let popupEvent = null;   // full event object currently shown in the popup
let detailEvent = null;  // full event object currently shown on the detail page

function formatDateRange(ev) {
  return ev.end_date ? `${ev.date} → ${ev.end_date}` : ev.date;
}

// Guarantee ev.totals exists: normally the backend computes it, but if it's
// missing (e.g. the standalone preview's mock backend) compute it here from
// the product lines so Sub Total / Tax / Discount / Amount Due always show.
function ensureTotals(ev) {
  if (ev.totals && typeof ev.totals.total === 'number') return ev;
  let subtotal = 0;
  (ev.products || []).forEach(p => {
    subtotal += (Number(p.days) || 0) * (Number(p.qty) || 0) * (Number(p.unit_price) || 0);
  });
  const discount = Number(ev.discount_amount) || 0;
  const rate = TAX_RATES[ev.tax_type] || 0;
  const taxableBase = subtotal - discount;
  let taxAmount, total;
  if (ev.tax_inclusive) {
    taxAmount = rate ? (taxableBase - taxableBase / (1 + rate)) : 0;
    total = taxableBase;
  } else {
    taxAmount = taxableBase * rate;
    total = taxableBase + taxAmount;
  }
  const paid = (ev.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  ev.totals = {
    subtotal: subtotal,
    discount_amount: discount,
    tax_amount: taxAmount,
    total: total,
    paid: paid,
    balance: total - paid,
  };
  return ev;
}

let popupFetch = null;   // in-flight fetch of the full event (products etc.)

function renderPopupFields(ev, totalText) {
  document.getElementById('ep-color-bar').style.background = ev.color || '#e0793d';
  document.getElementById('ep-client').textContent = ev.client_name || ev.title;
  document.getElementById('ep-date').textContent = formatDateRange(ev);
  document.getElementById('ep-location').textContent = ev.location || '—';
  document.getElementById('ep-total').textContent = totalText;
  const currency = ev.discount_currency || 'UGX';
  const bal = ev.totals && typeof ev.totals.balance === 'number' ? ev.totals.balance : null;
  document.getElementById('ep-balance').textContent = bal === null ? '…' : formatMoney(bal);
}

function openEventPopup(eventId) {
  // Show the popup INSTANTLY from the data the calendar already has —
  // no waiting on the network. The full record (products, exact totals)
  // loads in the background and fills in the total when it arrives.
  const cached = events.find(e => e.id === eventId);
  if (cached) {
    if (!cached.totals && cached.products) ensureTotals(cached);
    popupEvent = cached;
    const currency = cached.discount_currency || 'UGX';
    renderPopupFields(
      cached,
      cached.totals ? `${formatMoney(cached.totals.total)} ${currency}` : '…'
    );
    document.getElementById('event-popup').classList.remove('hidden');
  }

  popupFetch = api(`/api/events/${eventId}`).then(ev => {
    ensureTotals(ev);
    popupEvent = ev;
    // update popup if it's still open on this event
    if (!document.getElementById('event-popup').classList.contains('hidden')) {
      const currency = ev.discount_currency || 'UGX';
      renderPopupFields(ev, `${formatMoney(ev.totals.total)} ${currency}`);
    }
    if (!cached) document.getElementById('event-popup').classList.remove('hidden');
    return ev;
  }).catch(e => {
    toast(e.message);
    return null;
  });
}

function closeEventPopup() {
  document.getElementById('event-popup').classList.add('hidden');
}

document.getElementById('ep-close').addEventListener('click', closeEventPopup);
document.getElementById('event-popup').addEventListener('click', (e) => {
  if (e.target === document.getElementById('event-popup')) closeEventPopup();
});

document.getElementById('ep-more').addEventListener('click', () => {
  closeEventPopup();
  // Use the background fetch (usually already finished by the time the
  // user clicks More) so the detail page has the full product list.
  const pending = popupFetch || Promise.resolve(popupEvent);
  pending.then(ev => { if (ev) openEventDetail(ev); });
});

function openEventDetail(ev) {
  ensureTotals(ev);
  detailEvent = ev;
  const currency = ev.discount_currency || 'UGX';

  document.getElementById('event-detail-crumb').textContent = ev.code || `#${ev.id}`;
  document.getElementById('ed-category').textContent = ev.category || '—';
  document.getElementById('ed-date').textContent = formatDateRange(ev);
  document.getElementById('ed-location').textContent = ev.location || '—';
  document.getElementById('ed-classification').textContent = (ev.classification || 'retail').toUpperCase();
  document.getElementById('ed-client').textContent = ev.client_name || ev.title;

  const tbody = document.getElementById('ed-products-tbody');
  tbody.innerHTML = '';
  const products = ev.products || [];
  if (products.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" style="color:var(--text-muted);">No products on this event.</td>';
    tbody.appendChild(tr);
  } else {
    products.forEach(p => {
      const amount = (Number(p.days) || 0) * (Number(p.qty) || 0) * (Number(p.unit_price) || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(p.title || '')}</td>
        <td>${escapeHtml(p.dimensions || 'n/a')}</td>
        <td class="num">${p.days}</td>
        <td class="num">${p.qty}</td>
        <td class="num">${formatMoney(Number(p.unit_price) || 0)}</td>
        <td class="num">${formatMoney(amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const t = ev.totals || { subtotal: 0, tax_amount: 0, discount_amount: 0, total: 0 };
  const tfoot = document.getElementById('ed-totals-tfoot');
  const totalsRows = [
    ['Sub Total', t.subtotal],
    ['Tax', t.tax_amount],
    ['Discount', t.discount_amount],
  ];
  tfoot.innerHTML = totalsRows.map(([label, val]) => `
    <tr>
      <td colspan="4"></td>
      <td class="totals-label">${label}</td>
      <td class="totals-value">${formatMoney(val)}</td>
    </tr>
  `).join('') + `
    <tr class="grand">
      <td colspan="4"></td>
      <td class="totals-label">Amount Due</td>
      <td class="totals-value">${formatMoney(t.total)}</td>
    </tr>
  `;

  document.getElementById('ed-tax-note').textContent =
    ev.tax_inclusive ? 'Prices are tax inclusive' : 'Prices are tax exclusive';
  document.getElementById('ed-notes').textContent =
    ev.notes || 'No notes have been added to this event.';

  renderDetailPayments(ev);

  setActiveView('event-detail');
}

function renderDetailPayments(ev) {
  ensureTotals(ev);
  const payments = ev.payments || [];
  const total = (ev.totals && ev.totals.total) || 0;
  const paid = (ev.totals && typeof ev.totals.paid === 'number')
    ? ev.totals.paid
    : payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = (ev.totals && typeof ev.totals.balance === 'number')
    ? ev.totals.balance
    : total - paid;

  document.getElementById('ed-pay-total').textContent = formatMoney(total);
  document.getElementById('ed-pay-paid').textContent = formatMoney(paid);
  document.getElementById('ed-pay-balance').textContent = formatMoney(balance);

  const tbody = document.getElementById('ed-payments-tbody');
  tbody.innerHTML = '';
  document.getElementById('ed-payments-empty').classList.toggle('hidden', payments.length > 0);
  payments.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'pay-row-clickable';
    tr.innerHTML = `
      <td>${escapeHtml(p.date || '')}</td>
      <td>${escapeHtml(p.method || '')}</td>
      <td>${escapeHtml(p.paid_by || '')}</td>
      <td class="num">${formatMoney(Number(p.amount) || 0)}</td>
    `;
    tr.addEventListener('click', () => openPaymentDetail(p));
    tbody.appendChild(tr);
  });
}

// ---- Payment detail (landing page) ----

let detailPayment = null;

function openPaymentDetail(payment) {
  if (!detailEvent) return;
  const ev = detailEvent;
  detailPayment = payment;

  const ref = (window.receiptRefFor ? window.receiptRefFor(ev, payment) : (payment.id ? 'PMT-' + payment.id : ''));
  document.getElementById('pd-code').textContent = ref;
  document.getElementById('pd-crumb').textContent = ref;

  const currency = ev.discount_currency || 'UGX';
  document.getElementById('pd-amount').textContent = currency + ' ' + formatMoney(Number(payment.amount) || 0);
  document.getElementById('pd-paidby').textContent = payment.paid_by || '—';
  document.getElementById('pd-date').textContent = formatLongDate(payment.date);
  document.getElementById('pd-method').textContent = payment.method || '—';

  const eventLabel = (ev.code ? ev.code + ' – ' : '') + (ev.client_name || ev.title || '');
  const evEl = document.getElementById('pd-event');
  evEl.textContent = eventLabel;
  evEl.onclick = () => openEventDetail(ev);

  // Breakdown: the products this payment was allocated to
  const tbody = document.getElementById('pd-breakdown');
  tbody.innerHTML = '';
  const items = payment.items || [];
  const rows = items.length
    ? items.map(it => {
        const prod = (ev.products || []).find(pr => (pr.title || '').trim() === (it.product_title || '').trim()) || {};
        const total = (typeof prod.line_total === 'number') ? prod.line_total : 0;
        const bal = (typeof prod.balance === 'number') ? prod.balance : 0;
        return { title: it.product_title || '—', total: total, paid: Number(it.amount) || 0, balance: bal };
      })
    : [{ title: '—', total: 0, paid: Number(payment.amount) || 0, balance: 0 }];
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.title)}</td>
      <td class="num">${formatMoney(r.total)}</td>
      <td class="num">${formatMoney(r.paid)}</td>
      <td class="num">${formatMoney(r.balance)}</td>
    `;
    tbody.appendChild(tr);
  });

  setActiveView('payment-detail');
}

// Format "2026-06-29" -> "Monday 29 June 2026"
function formatLongDate(iso) {
  const parts = String(iso || '').split('-');
  if (parts.length !== 3) return String(iso || '');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  if (isNaN(d.getTime())) return String(iso || '');
  return days[d.getDay()] + ' ' + Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
}

document.getElementById('pd-back').addEventListener('click', () => {
  if (detailEvent) openEventDetail(detailEvent);
  else setActiveView('dashboard');
});

document.getElementById('pd-receipt').addEventListener('click', () => {
  if (!detailPayment) return;
  try {
    window.downloadPaymentReceiptPDF(detailEvent, detailPayment, formatMoney);
  } catch (e) { toast('Could not build receipt: ' + e.message); }
});

document.getElementById('pd-edit').addEventListener('click', () => {
  if (detailPayment) openPaymentForm(detailPayment);
});

document.getElementById('pd-delete').addEventListener('click', async () => {
  if (!detailPayment) return;
  if (!confirm('Delete this payment? This cannot be undone.')) return;
  try {
    await api(`/api/payments/${detailPayment.id}`, { method: 'DELETE' });
    toast('Payment removed');
    const fresh = await api(`/api/events/${detailEvent.id}`);
    detailEvent = fresh;
    await loadAll();
    openEventDetail(fresh);
  } catch (e) { toast(e.message); }
});

// ---- New Payment full page ----

let pfEditingOriginalAmount = 0;

function pfRecompute() {
  const ev = detailEvent || {};
  const t = ev.totals || {};
  let allocated = 0;
  document.querySelectorAll('#pf-products .pf-prod-row').forEach(row => {
    allocated += Number(row.querySelector('.pf-pay-input').value) || 0;
  });
  allocated = Math.round(allocated * 100) / 100;
  document.getElementById('pf-amount').value = allocated ? allocated : '';

  const total = t.total || 0;
  // When editing, remove this payment's original amount from the baseline so
  // it isn't counted twice.
  const alreadyPaid = (t.paid || 0) - (pfEditingOriginalAmount || 0);
  const newPaid = alreadyPaid + allocated;
  document.getElementById('pf-total').textContent = formatMoney(total);
  document.getElementById('pf-paid').textContent = formatMoney(newPaid);
  document.getElementById('pf-balance').textContent = formatMoney(total - newPaid);
}

function openPaymentForm(editPayment) {
  if (!detailEvent) return;
  const ev = detailEvent;
  ensureTotals(ev);
  const editing = editPayment && editPayment.id != null;
  pfEditingOriginalAmount = editing ? (Number(editPayment.amount) || 0) : 0;

  document.getElementById('pf-event-id').value = ev.id;
  document.getElementById('pf-payment-id').value = editing ? editPayment.id : '';
  document.getElementById('pf-crumb').textContent = editing ? 'Edit Payment' : 'New Payment';
  document.getElementById('pf-save').innerHTML = editing ? '&#128077; Update Payment' : '&#128077; Create Payment';

  const label = (ev.code ? ev.code + '  ·  ' : '') + (ev.client_name || ev.title || '');
  document.getElementById('pf-event').value = label;
  document.getElementById('pf-date').value = editing ? (editPayment.date || todayISO()) : todayISO();
  document.getElementById('pf-paid-by').value = editing ? (editPayment.paid_by || '') : (ev.client_name || '');
  document.getElementById('pf-method').value = editing ? (editPayment.method || 'Cash') : 'Cash';
  document.getElementById('pf-amount').value = '';

  // Map existing allocations (when editing) by product title
  const existing = {};
  if (editing) (editPayment.items || []).forEach(it => {
    existing[(it.product_title || '').trim()] = Number(it.amount) || 0;
  });

  // Build the per-product allocation rows (Product / Balance / Amount Paying)
  const wrap = document.getElementById('pf-products');
  wrap.innerHTML = '';
  const products = (ev.products || []).filter(p => (p.title || '').trim());
  const pfWrap = document.getElementById('pf-products-wrap');
  pfWrap.classList.toggle('hidden', products.length === 0);
  products.forEach(p => {
    const lineTotal = (typeof p.line_total === 'number')
      ? p.line_total
      : (Number(p.days || 1) * Number(p.qty || 1) * Number(p.unit_price || 0));
    let bal = (typeof p.balance === 'number') ? p.balance : lineTotal;
    const title = (p.title || '').trim();
    const preset = existing[title] || 0;
    // When editing, this payment's allocation is already counted in the
    // balance, so add it back to show the balance excluding this payment.
    if (editing) bal = Math.round((bal + preset) * 100) / 100;
    const row = document.createElement('div');
    row.className = 'pf-prod-row';
    row.dataset.title = p.title || '';
    row.innerHTML = `
      <span class="pf-col-name">${escapeHtml(p.title || '')}</span>
      <span class="pf-col-bal">${formatMoney(bal)}</span>
      <span class="pf-col-pay">
        <input type="number" class="pf-pay-input" min="0" step="any" placeholder="0">
      </span>
    `;
    const input = row.querySelector('.pf-pay-input');
    if (preset > 0) input.value = preset;
    input.addEventListener('input', pfRecompute);
    wrap.appendChild(row);
  });

  pfRecompute();
  setActiveView('payment-form');
}

document.getElementById('ed-add-payment').addEventListener('click', () => openPaymentForm());

function closePaymentForm() {
  // If we were editing, return to that payment's landing page; otherwise the event.
  const editId = document.getElementById('pf-payment-id').value;
  if (editId && detailPayment) { openPaymentDetail(detailPayment); return; }
  if (detailEvent) openEventDetail(detailEvent);
  else setActiveView('dashboard');
}

document.getElementById('pf-back').addEventListener('click', closePaymentForm);
document.getElementById('pf-cancel').addEventListener('click', closePaymentForm);

let paymentSaving = false;
document.getElementById('pf-save').addEventListener('click', async () => {
  if (paymentSaving) return;
  // Gather per-product allocations
  const items = [];
  document.querySelectorAll('#pf-products .pf-prod-row').forEach(row => {
    const amt = Number(row.querySelector('.pf-pay-input').value) || 0;
    if (amt > 0) items.push({ product_title: row.dataset.title || '', amount: amt });
  });
  const editId = document.getElementById('pf-payment-id').value;
  const editing = !!editId;
  const payload = {
    event_id: Number(document.getElementById('pf-event-id').value),
    amount: Number(document.getElementById('pf-amount').value) || 0,
    date: document.getElementById('pf-date').value,
    method: document.getElementById('pf-method').value,
    paid_by: document.getElementById('pf-paid-by').value.trim(),
    items: items,
  };
  if (payload.amount <= 0) { toast('Enter an amount for at least one product'); return; }

  const btn = document.getElementById('pf-save');
  paymentSaving = true;
  btn.disabled = true; btn.style.opacity = '0.6';
  try {
    if (editing) {
      await api(`/api/payments/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Payment updated');
    } else {
      await api('/api/payments', { method: 'POST', body: JSON.stringify(payload) });
      toast('Payment recorded');
    }
    const fresh = await api(`/api/events/${payload.event_id}`);
    detailEvent = fresh;
    await loadAll();
    if (editing) {
      // Return to the payment's landing page with refreshed figures
      const updated = (fresh.payments || []).find(p => String(p.id) === String(editId));
      if (updated) openPaymentDetail(updated);
      else openEventDetail(fresh);
    } else {
      openEventDetail(fresh);   // land back on the event detail with updated balance
    }
  } catch (e) {
    toast(e.message);
  } finally {
    paymentSaving = false;
    btn.disabled = false; btn.style.opacity = '';
  }
});

// ---- Payments register (sidebar) ----

async function renderPaymentsRegister() {
  const tbody = document.getElementById('payments-tbody');
  tbody.innerHTML = '';
  let payments = [];
  try {
    payments = await api('/api/payments');
  } catch (e) {
    toast(e.message);
  }
  document.getElementById('payments-register-empty').classList.toggle('hidden', payments.length > 0);
  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  document.getElementById('pay-register-summary').textContent =
    payments.length ? `${payments.length} payment${payments.length > 1 ? 's' : ''} · ${formatMoney(total)} total` : '';
  payments.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.date || '')}</td>
      <td>${escapeHtml(p.client_name || '')}</td>
      <td>${escapeHtml(p.event_code || p.event_title || '')}</td>
      <td>${escapeHtml(p.method || '')}</td>
      <td>${escapeHtml(p.paid_by || '')}</td>
      <td class="num">${formatMoney(Number(p.amount) || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('event-detail-back').addEventListener('click', () => setActiveView('dashboard'));

document.getElementById('ed-edit-btn').addEventListener('click', () => {
  if (detailEvent) openEventForm(detailEvent.id);
});

// ---- Invoice: generate a real PDF file and download it directly ----

document.getElementById('ed-invoice-btn').addEventListener('click', () => {
  if (!detailEvent) return;
  window.downloadInvoicePDF(detailEvent, formatMoney, formatDateRange)
    .then(() => toast('Quotation downloaded'))
    .catch(e => toast('Could not generate quotation: ' + e.message));
});

// ---------------- Calendar controls ----------------

document.getElementById('btn-month').addEventListener('click', () => {
  calendarMode = 'month';
  document.getElementById('btn-month').classList.add('active');
  document.getElementById('btn-list').classList.remove('active');
  renderDashboard();
});

document.getElementById('btn-list').addEventListener('click', () => {
  calendarMode = 'list';
  document.getElementById('btn-list').classList.add('active');
  document.getElementById('btn-month').classList.remove('active');
  renderDashboard();
});

document.getElementById('btn-today').addEventListener('click', () => {
  viewDate = new Date();
  renderDashboard();
});

document.getElementById('btn-prev').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderDashboard();
});

document.getElementById('btn-next').addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderDashboard();
});

document.getElementById('btn-add-event').addEventListener('click', () => openEventForm(null, todayISO()));

// =========================================================================
// New / Edit Event — full page form
// =========================================================================

let productRows = [];   // in-memory rows: {title, dimensions, days, qty, unit_price}
let productRowSeq = 0;

function populateColorSelect() {
  const sel = document.getElementById('ef-color');
  sel.innerHTML = '';
  PALETTE.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

const STARTER_CATEGORIES = [
  'Wedding', 'Introduction (Kwanjula)', 'Birthday', 'Corporate Event',
  'Anniversary', 'Baby Shower', 'Graduation', 'Other',
];

// Category is a free-text field (so you can type anything), but we still
// offer autocomplete suggestions built from a starter list plus whatever
// categories you've already used on other events.
function populateCategoryDatalist() {
  const list = document.getElementById('ef-category-list');
  const used = events.map(e => e.category).filter(Boolean);
  const options = Array.from(new Set([...STARTER_CATEGORIES, ...used]));
  list.innerHTML = '';
  options.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function renderProductRows() {
  const tbody = document.getElementById('ef-products-tbody');
  tbody.innerHTML = '';
  document.getElementById('ef-products-empty').classList.toggle('hidden', productRows.length > 0);

  productRows.forEach(row => {
    const tr = document.createElement('tr');

    const amount = (Number(row.days) || 0) * (Number(row.qty) || 0) * (Number(row.unit_price) || 0);

    tr.innerHTML = `
      <td><input type="text" data-field="title" value="${escapeHtml(row.title || '')}" placeholder="e.g. Chiavari chairs"></td>
      <td><input type="text" data-field="dimensions" value="${escapeHtml(row.dimensions || '')}" placeholder="e.g. 10x10 ft"></td>
      <td><input type="number" min="0" step="any" data-field="days" value="${row.days}"></td>
      <td><input type="number" min="0" step="any" data-field="qty" value="${row.qty}"></td>
      <td><input type="number" min="0" step="any" data-field="unit_price" value="${row.unit_price}"></td>
      <td class="amount-cell">${formatMoney(amount)}</td>
      <td><button class="remove-product-btn" title="Remove">&times;</button></td>
    `;

    tr.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        row[field] = field === 'title' || field === 'dimensions' ? input.value : Number(input.value);
        // Update ONLY this row's amount cell — re-rendering the whole table
        // here destroyed the input mid-typing, so focus was lost after the
        // first character.
        const newAmount = (Number(row.days) || 0) * (Number(row.qty) || 0) * (Number(row.unit_price) || 0);
        tr.querySelector('.amount-cell').textContent = formatMoney(newAmount);
        recomputeSummary();
      });
    });

    tr.querySelector('.remove-product-btn').addEventListener('click', () => {
      productRows = productRows.filter(r => r._id !== row._id);
      renderProductRows();
      recomputeSummary();
    });

    tbody.appendChild(tr);
  });
}

document.getElementById('ef-add-product').addEventListener('click', () => {
  productRows.push({ _id: ++productRowSeq, title: '', dimensions: '', days: 1, qty: 1, unit_price: 0 });
  renderProductRows();
  recomputeSummary();
});

function recomputeSummary() {
  let subtotal = 0;
  productRows.forEach(r => {
    subtotal += (Number(r.days) || 0) * (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
  });

  const discount = Number(document.getElementById('ef-discount').value) || 0;
  const taxInclusive = document.getElementById('ef-tax-inclusive').checked;
  const taxType = document.getElementById('ef-tax-type').value;
  const rate = TAX_RATES[taxType] || 0;

  const taxableBase = subtotal - discount;
  let taxAmount = 0;
  let total = 0;

  if (taxInclusive) {
    taxAmount = rate ? (taxableBase - taxableBase / (1 + rate)) : 0;
    total = taxableBase;
  } else {
    taxAmount = taxableBase * rate;
    total = taxableBase + taxAmount;
  }

  document.getElementById('ef-sum-subtotal').textContent = formatMoney(subtotal);
  document.getElementById('ef-sum-discount').textContent = formatMoney(discount);
  document.getElementById('ef-sum-tax').textContent = formatMoney(taxAmount);
  document.getElementById('ef-sum-total').textContent = formatMoney(total);
}

document.getElementById('ef-discount').addEventListener('input', recomputeSummary);
document.getElementById('ef-tax-type').addEventListener('change', recomputeSummary);
document.getElementById('ef-tax-inclusive').addEventListener('change', () => {
  const checked = document.getElementById('ef-tax-inclusive').checked;
  document.getElementById('ef-tax-inclusive-label').textContent =
    checked ? 'Prices are tax inclusive' : 'Prices are tax exclusive';
  recomputeSummary();
});

// ---- Client search within the event form ----

function renderClientSuggestions(query) {
  const box = document.getElementById('ef-client-suggestions');
  const q = (query || '').trim().toLowerCase();
  const matches = q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;

  box.innerHTML = '';
  if (matches.length === 0) {
    box.innerHTML = '<div class="client-suggestion-empty">No matching clients</div>';
  } else {
    matches.slice(0, 20).forEach(c => {
      const item = document.createElement('div');
      item.className = 'client-suggestion-item';
      item.textContent = c.name;
      item.addEventListener('click', () => {
        document.getElementById('ef-client-id').value = c.id;
        document.getElementById('ef-client-search').value = c.name;
        box.classList.add('hidden');
      });
      box.appendChild(item);
    });
  }
  box.classList.remove('hidden');
}

document.getElementById('ef-client-search').addEventListener('focus', (e) => {
  renderClientSuggestions(e.target.value);
});

document.getElementById('ef-client-search').addEventListener('input', (e) => {
  document.getElementById('ef-client-id').value = '';
  renderClientSuggestions(e.target.value);
});

document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.client-search');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('ef-client-suggestions').classList.add('hidden');
  }
});

document.getElementById('ef-add-client-link').addEventListener('click', (e) => {
  e.preventDefault();
  pendingClientLinkToEventForm = true;
  openClientModal(null);
});

// ---- Open / populate / save the event form page ----

function openEventForm(eventId, prefillDate) {
  document.getElementById('ef-event-id').value = eventId || '';
  document.getElementById('event-form-crumb').textContent = eventId ? 'Edit Event' : 'New Event';
  document.getElementById('ef-save-label').textContent = eventId ? 'Save Event' : 'Create Event';
  document.getElementById('ef-delete').classList.toggle('hidden', !eventId);

  populateColorSelect();
  populateCategoryDatalist();

  document.getElementById('ef-client-search').value = '';
  document.getElementById('ef-client-id').value = '';
  document.querySelector('input[name="ef-classification"][value="retail"]').checked = true;
  document.getElementById('ef-date').value = prefillDate || todayISO();
  document.getElementById('ef-end-date').value = '';
  document.getElementById('ef-category').value = '';
  document.getElementById('ef-color').value = PALETTE[Math.floor(Math.random() * PALETTE.length)].value;
  document.getElementById('ef-location').value = '';
  document.getElementById('ef-tax-inclusive').checked = false;
  document.getElementById('ef-tax-inclusive-label').textContent = 'Prices are tax exclusive';
  document.getElementById('ef-tax-type').value = 'no_tax';
  document.getElementById('ef-discount').value = 0;
  document.getElementById('ef-discount-currency').value = 'UGX';
  productRows = [];
  productRowSeq = 0;

  setActiveView('event-form');

  if (eventId) {
    api(`/api/events/${eventId}`).then(ev => {
      document.getElementById('ef-client-id').value = ev.client_id || '';
      document.getElementById('ef-client-search').value = ev.client_name || '';
      const classEl = document.querySelector(`input[name="ef-classification"][value="${ev.classification || 'retail'}"]`);
      if (classEl) classEl.checked = true;
      document.getElementById('ef-date').value = ev.date || '';
      document.getElementById('ef-end-date').value = ev.end_date || '';
      document.getElementById('ef-category').value = ev.category || '';
      document.getElementById('ef-color').value = ev.color || PALETTE[0].value;
      document.getElementById('ef-location').value = ev.location || '';
      document.getElementById('ef-tax-inclusive').checked = !!ev.tax_inclusive;
      document.getElementById('ef-tax-inclusive-label').textContent =
        ev.tax_inclusive ? 'Prices are tax inclusive' : 'Prices are tax exclusive';
      document.getElementById('ef-tax-type').value = ev.tax_type || 'no_tax';
      document.getElementById('ef-discount').value = ev.discount_amount || 0;
      document.getElementById('ef-discount-currency').value = ev.discount_currency || 'UGX';

      productRows = (ev.products || []).map(p => ({
        _id: ++productRowSeq,
        title: p.title, dimensions: p.dimensions, days: p.days, qty: p.qty, unit_price: p.unit_price,
      }));
      renderProductRows();
      recomputeSummary();
    }).catch(e => toast(e.message));
  } else {
    renderProductRows();
    recomputeSummary();
  }
}

function closeEventForm() {
  setActiveView('dashboard');
}

document.getElementById('event-form-back').addEventListener('click', closeEventForm);
document.getElementById('ef-cancel').addEventListener('click', closeEventForm);

let eventFormSaving = false;

document.getElementById('ef-save').addEventListener('click', async () => {
  // Guard against double-submits (double-click, or clicking again while a
  // slow save is still in flight) — without this, each click fired its own
  // POST and created a duplicate event on the same day, which is what made
  // the calendar look "messy" after creating a single order.
  if (eventFormSaving) return;

  const id = document.getElementById('ef-event-id').value;
  const clientId = document.getElementById('ef-client-id').value;
  const date = document.getElementById('ef-date').value;

  if (!clientId) {
    toast('Please select a client from the list');
    return;
  }
  if (!date) {
    toast('Event date is required');
    return;
  }

  const payload = {
    client_id: Number(clientId),
    classification: document.querySelector('input[name="ef-classification"]:checked').value,
    date,
    end_date: document.getElementById('ef-end-date').value || null,
    category: document.getElementById('ef-category').value,
    color: document.getElementById('ef-color').value,
    location: document.getElementById('ef-location').value,
    tax_inclusive: document.getElementById('ef-tax-inclusive').checked,
    tax_type: document.getElementById('ef-tax-type').value,
    discount_amount: Number(document.getElementById('ef-discount').value) || 0,
    discount_currency: document.getElementById('ef-discount-currency').value,
    products: productRows
      .filter(r => (r.title || '').trim())
      .map(r => ({
        title: r.title, dimensions: r.dimensions, days: Number(r.days) || 1,
        qty: Number(r.qty) || 1, unit_price: Number(r.unit_price) || 0,
      })),
  };

  const saveBtn = document.getElementById('ef-save');
  const saveLabel = document.getElementById('ef-save-label');
  const originalLabel = saveLabel.textContent;
  eventFormSaving = true;
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.6';
  saveBtn.style.cursor = 'not-allowed';
  saveLabel.textContent = 'Saving…';

  try {
    if (id) {
      await api(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Event updated');
    } else {
      await api('/api/events', { method: 'POST', body: JSON.stringify(payload) });
      toast('Event created');
    }
    await loadAll();
    closeEventForm();
  } catch (e) {
    toast(e.message);
  } finally {
    eventFormSaving = false;
    saveBtn.disabled = false;
    saveBtn.style.opacity = '';
    saveBtn.style.cursor = '';
    saveLabel.textContent = originalLabel;
  }
});

document.getElementById('ef-delete').addEventListener('click', async () => {
  const id = document.getElementById('ef-event-id').value;
  if (!id) return;
  try {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    toast('Event deleted');
    await loadAll();
    closeEventForm();
  } catch (e) {
    toast(e.message);
  }
});

// ---------------- Clients ----------------

function renderClientsTable() {
  const tbody = document.getElementById('clients-tbody');
  tbody.innerHTML = '';
  document.getElementById('clients-empty').classList.toggle('hidden', clients.length > 0);

  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(c.address || '')}</td>
      <td>${escapeHtml(c.notes || '')}</td>
      <td></td>
    `;
    tr.addEventListener('click', () => openClientModal(c));
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

document.getElementById('btn-add-client').addEventListener('click', () => openClientModal(null));

// When true, saving the client modal should also select that client back in
// the event form's client search field (used for the "Click here to add a
// new client" link inside the event form).
let pendingClientLinkToEventForm = false;

function openClientModal(c) {
  document.getElementById('client-modal-title').textContent = c ? 'Edit Client' : 'New Client';
  document.getElementById('client-id').value = c ? c.id : '';
  document.getElementById('client-name').value = c ? c.name : '';
  document.getElementById('client-phone').value = c ? (c.phone || '') : '';
  document.getElementById('client-email').value = c ? (c.email || '') : '';
  document.getElementById('client-address').value = c ? (c.address || '') : '';
  document.getElementById('client-notes').value = c ? (c.notes || '') : '';
  document.getElementById('client-delete').classList.toggle('hidden', !c);
  document.getElementById('client-modal').classList.remove('hidden');
}

function closeClientModal() {
  document.getElementById('client-modal').classList.add('hidden');
  pendingClientLinkToEventForm = false;
}

document.getElementById('client-cancel').addEventListener('click', closeClientModal);

let clientFormSaving = false;

document.getElementById('client-save').addEventListener('click', async () => {
  if (clientFormSaving) return; // same double-submit guard as the event form

  const id = document.getElementById('client-id').value;
  const payload = {
    name: document.getElementById('client-name').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    email: document.getElementById('client-email').value.trim(),
    address: document.getElementById('client-address').value.trim(),
    notes: document.getElementById('client-notes').value.trim(),
  };
  if (!payload.name) {
    toast('Name is required');
    return;
  }

  const saveBtn = document.getElementById('client-save');
  clientFormSaving = true;
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.6';
  saveBtn.style.cursor = 'not-allowed';

  try {
    let newClientId = id;
    if (id) {
      await api(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Client updated');
    } else {
      const created = await api('/api/clients', { method: 'POST', body: JSON.stringify(payload) });
      newClientId = created.id;
      toast('Client created');
    }
    await loadAll();

    const shouldLink = pendingClientLinkToEventForm;
    closeClientModal();

    if (shouldLink) {
      document.getElementById('ef-client-id').value = newClientId;
      document.getElementById('ef-client-search').value = payload.name;
    } else if (!document.getElementById('view-clients').classList.contains('hidden')) {
      renderClientsTable();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    clientFormSaving = false;
    saveBtn.disabled = false;
    saveBtn.style.opacity = '';
    saveBtn.style.cursor = '';
  }
});

document.getElementById('client-delete').addEventListener('click', async () => {
  const id = document.getElementById('client-id').value;
  if (!id) return;
  try {
    await api(`/api/clients/${id}`, { method: 'DELETE' });
    toast('Client deleted');
    closeClientModal();
    await loadAll();
    renderClientsTable();
  } catch (e) {
    toast(e.message);
  }
});

// ---------------- Init ----------------

(async function init() {
  try {
    await loadAll();
  } catch (e) {
    toast('Could not load data: ' + e.message);
  }
  renderDashboard();
})();
