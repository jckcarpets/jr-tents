from flask import Flask, request, jsonify, render_template
import sqlite3
import os
import random
import string
from datetime import datetime, timezone

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'eventsug.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def _table_columns(conn, table):
    return {row['name'] for row in conn.execute(f'PRAGMA table_info({table})').fetchall()}


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            address TEXT,
            notes TEXT,
            created_at TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            code TEXT,
            date TEXT NOT NULL,
            end_date TEXT,
            color TEXT DEFAULT '#e07b39',
            client_id INTEGER,
            notes TEXT,
            created_at TEXT,
            FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
        )
    ''')

    # Migrate in any columns added after the first release, so existing
    # eventsug.db files from earlier versions keep working.
    existing = _table_columns(conn, 'events')
    migrations = {
        'classification': "ALTER TABLE events ADD COLUMN classification TEXT DEFAULT 'retail'",
        'category': "ALTER TABLE events ADD COLUMN category TEXT",
        'location': "ALTER TABLE events ADD COLUMN location TEXT",
        'tax_inclusive': "ALTER TABLE events ADD COLUMN tax_inclusive INTEGER DEFAULT 0",
        'tax_type': "ALTER TABLE events ADD COLUMN tax_type TEXT DEFAULT 'no_tax'",
        'discount_amount': "ALTER TABLE events ADD COLUMN discount_amount REAL DEFAULT 0",
        'discount_currency': "ALTER TABLE events ADD COLUMN discount_currency TEXT DEFAULT 'UGX'",
    }
    for col, ddl in migrations.items():
        if col not in existing:
            conn.execute(ddl)

    conn.execute('''
        CREATE TABLE IF NOT EXISTS event_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            title TEXT,
            dimensions TEXT,
            days REAL DEFAULT 1,
            qty REAL DEFAULT 1,
            unit_price REAL DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            amount REAL DEFAULT 0,
            date TEXT,
            method TEXT,
            paid_by TEXT,
            created_at TEXT,
            FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS payment_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id INTEGER NOT NULL,
            product_title TEXT,
            amount REAL DEFAULT 0,
            FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_event_code():
    return ''.join(random.choices(string.ascii_uppercase, k=3)) + \
        ''.join(random.choices(string.digits, k=5))


TAX_RATES = {'no_tax': 0.0, 'vat18': 0.18}


def totals_from_subtotal(subtotal, tax_inclusive, tax_type, discount_amount):
    subtotal = float(subtotal or 0)
    discount_amount = float(discount_amount or 0)
    rate = TAX_RATES.get(tax_type, 0.0)
    taxable_base = subtotal - discount_amount
    if tax_inclusive:
        tax_amount = taxable_base - (taxable_base / (1 + rate)) if rate else 0.0
        total = taxable_base
    else:
        tax_amount = taxable_base * rate
        total = taxable_base + tax_amount
    return {
        'subtotal': round(subtotal, 2),
        'discount_amount': round(discount_amount, 2),
        'tax_amount': round(tax_amount, 2),
        'total': round(total, 2),
    }


def compute_totals(products, tax_inclusive, tax_type, discount_amount):
    subtotal = 0.0
    for p in products:
        days = p.get('days') or 1
        qty = p.get('qty') or 1
        unit_price = p.get('unit_price') or 0
        subtotal += float(days) * float(qty) * float(unit_price)
    return totals_from_subtotal(subtotal, tax_inclusive, tax_type, discount_amount)


@app.route('/')
def index():
    return render_template('index.html')


# ---------- Clients ----------

@app.route('/api/clients', methods=['GET'])
def get_clients():
    conn = get_db()
    rows = conn.execute('SELECT * FROM clients ORDER BY name COLLATE NOCASE').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM clients WHERE id=?', (client_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'not found'}), 404
    return jsonify(dict(row))


@app.route('/api/clients', methods=['POST'])
def create_client():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO clients (name, phone, email, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        (name, data.get('phone'), data.get('email'), data.get('address'), data.get('notes'), now_iso())
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({'id': new_id}), 201


@app.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    conn.execute(
        'UPDATE clients SET name=?, phone=?, email=?, address=?, notes=? WHERE id=?',
        (name, data.get('phone'), data.get('email'), data.get('address'), data.get('notes'), client_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    conn = get_db()
    conn.execute('DELETE FROM clients WHERE id=?', (client_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


# ---------- Events ----------

def _serialize_event_row(row):
    return dict(row)


@app.route('/api/events', methods=['GET'])
def get_events():
    # Calendar list; includes pre-computed totals so the popup can show the
    # amount instantly without a second request.
    conn = get_db()
    rows = conn.execute('''
        SELECT events.*, clients.name as client_name
        FROM events LEFT JOIN clients ON events.client_id = clients.id
        ORDER BY date
    ''').fetchall()
    sub_rows = conn.execute('''
        SELECT event_id, COALESCE(SUM(days * qty * unit_price), 0) AS subtotal
        FROM event_products GROUP BY event_id
    ''').fetchall()
    pay_rows = conn.execute('''
        SELECT event_id, COALESCE(SUM(amount), 0) AS paid
        FROM payments GROUP BY event_id
    ''').fetchall()
    conn.close()
    subtotals = {r['event_id']: r['subtotal'] for r in sub_rows}
    paids = {r['event_id']: r['paid'] for r in pay_rows}
    out = []
    for r in rows:
        d = _serialize_event_row(r)
        d['totals'] = totals_from_subtotal(
            subtotals.get(d['id'], 0), bool(d.get('tax_inclusive')),
            d.get('tax_type') or 'no_tax', d.get('discount_amount') or 0)
        paid = float(paids.get(d['id'], 0) or 0)
        d['totals']['paid'] = round(paid, 2)
        d['totals']['balance'] = round(d['totals']['total'] - paid, 2)
        out.append(d)
    return jsonify(out)


@app.route('/api/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    conn = get_db()
    row = conn.execute('''
        SELECT events.*, clients.name as client_name, clients.phone as client_phone
        FROM events LEFT JOIN clients ON events.client_id = clients.id
        WHERE events.id=?
    ''', (event_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'not found'}), 404
    products = conn.execute(
        'SELECT * FROM event_products WHERE event_id=? ORDER BY sort_order, id', (event_id,)
    ).fetchall()
    payments = conn.execute(
        'SELECT * FROM payments WHERE event_id=? ORDER BY date, id', (event_id,)
    ).fetchall()
    items = conn.execute('''
        SELECT payment_items.* FROM payment_items
        JOIN payments ON payment_items.payment_id = payments.id
        WHERE payments.event_id=?
    ''', (event_id,)).fetchall()
    conn.close()

    data = _serialize_event_row(row)
    data['products'] = [dict(p) for p in products]

    # Attach each payment's product allocation items
    items_by_payment = {}
    paid_by_title = {}
    for it in items:
        d = dict(it)
        items_by_payment.setdefault(d['payment_id'], []).append(d)
        title = (d.get('product_title') or '').strip()
        paid_by_title[title] = paid_by_title.get(title, 0.0) + float(d.get('amount') or 0)
    payments_out = []
    for p in payments:
        pd = dict(p)
        pd['items'] = items_by_payment.get(pd['id'], [])
        payments_out.append(pd)
    data['payments'] = payments_out

    # Per-product line total, paid, balance
    for p in data['products']:
        line = (float(p.get('days') or 1) * float(p.get('qty') or 1) * float(p.get('unit_price') or 0))
        title = (p.get('title') or '').strip()
        ppaid = round(paid_by_title.get(title, 0.0), 2)
        p['line_total'] = round(line, 2)
        p['paid'] = ppaid
        p['balance'] = round(line - ppaid, 2)

    data['totals'] = compute_totals(
        data['products'], bool(data.get('tax_inclusive')), data.get('tax_type') or 'no_tax',
        data.get('discount_amount') or 0
    )
    paid = sum(float(p['amount'] or 0) for p in payments)
    data['totals']['paid'] = round(paid, 2)
    data['totals']['balance'] = round(data['totals']['total'] - paid, 2)
    return jsonify(data)


def _save_products(conn, event_id, products):
    conn.execute('DELETE FROM event_products WHERE event_id=?', (event_id,))
    for idx, p in enumerate(products or []):
        title = (p.get('title') or '').strip()
        if not title:
            continue
        conn.execute(
            'INSERT INTO event_products (event_id, title, dimensions, days, qty, unit_price, sort_order) '
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            (event_id, title, p.get('dimensions'), p.get('days') or 1, p.get('qty') or 1,
             p.get('unit_price') or 0, idx)
        )


@app.route('/api/events', methods=['POST'])
def create_event():
    data = request.get_json(force=True)
    client_id = data.get('client_id')
    date = (data.get('date') or '').strip()
    if not client_id:
        return jsonify({'error': 'client is required'}), 400
    if not date:
        return jsonify({'error': 'event date is required'}), 400

    conn = get_db()
    client = conn.execute('SELECT * FROM clients WHERE id=?', (client_id,)).fetchone()
    if not client:
        conn.close()
        return jsonify({'error': 'client not found'}), 400

    code = (data.get('code') or '').strip() or gen_event_code()

    cur = conn.execute(
        'INSERT INTO events (title, code, date, end_date, color, client_id, notes, created_at, '
        'classification, category, location, tax_inclusive, tax_type, discount_amount, discount_currency) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (client['name'], code, date, data.get('end_date') or None,
         data.get('color') or '#e0793d', client_id, data.get('notes'), now_iso(),
         data.get('classification') or 'retail', data.get('category'), data.get('location'),
         1 if data.get('tax_inclusive') else 0, data.get('tax_type') or 'no_tax',
         data.get('discount_amount') or 0, data.get('discount_currency') or 'UGX')
    )
    new_id = cur.lastrowid
    _save_products(conn, new_id, data.get('products'))
    conn.commit()
    conn.close()
    return jsonify({'id': new_id}), 201


@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    data = request.get_json(force=True)
    client_id = data.get('client_id')
    date = (data.get('date') or '').strip()
    if not client_id:
        return jsonify({'error': 'client is required'}), 400
    if not date:
        return jsonify({'error': 'event date is required'}), 400

    conn = get_db()
    client = conn.execute('SELECT * FROM clients WHERE id=?', (client_id,)).fetchone()
    if not client:
        conn.close()
        return jsonify({'error': 'client not found'}), 400

    conn.execute(
        'UPDATE events SET title=?, code=?, date=?, end_date=?, color=?, client_id=?, notes=?, '
        'classification=?, category=?, location=?, tax_inclusive=?, tax_type=?, discount_amount=?, '
        'discount_currency=? WHERE id=?',
        (client['name'], data.get('code'), date, data.get('end_date') or None,
         data.get('color') or '#e0793d', client_id, data.get('notes'),
         data.get('classification') or 'retail', data.get('category'), data.get('location'),
         1 if data.get('tax_inclusive') else 0, data.get('tax_type') or 'no_tax',
         data.get('discount_amount') or 0, data.get('discount_currency') or 'UGX', event_id)
    )
    _save_products(conn, event_id, data.get('products'))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    conn = get_db()
    conn.execute('DELETE FROM event_products WHERE event_id=?', (event_id,))
    conn.execute('DELETE FROM payments WHERE event_id=?', (event_id,))
    conn.execute('DELETE FROM events WHERE id=?', (event_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


# ---------- Payments ----------

@app.route('/api/payments', methods=['GET'])
def get_payments():
    # Full register of all payments, newest first, with event + client info.
    conn = get_db()
    rows = conn.execute('''
        SELECT payments.*, events.code AS event_code, events.title AS event_title,
               clients.name AS client_name
        FROM payments
        LEFT JOIN events ON payments.event_id = events.id
        LEFT JOIN clients ON events.client_id = clients.id
        ORDER BY payments.date DESC, payments.id DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/payments', methods=['POST'])
def create_payment():
    data = request.get_json(force=True)
    event_id = data.get('event_id')
    if not event_id:
        return jsonify({'error': 'event is required'}), 400

    # Per-product allocation items: [{product_title, amount}, ...]
    raw_items = data.get('items') or []
    items = []
    for it in raw_items:
        try:
            amt = float(it.get('amount') or 0)
        except (TypeError, ValueError):
            amt = 0
        if amt > 0:
            items.append({'product_title': (it.get('product_title') or '').strip(), 'amount': amt})

    # If items were supplied, the payment amount is the sum of the allocations.
    if items:
        amount = round(sum(i['amount'] for i in items), 2)
    else:
        try:
            amount = float(data.get('amount') or 0)
        except (TypeError, ValueError):
            return jsonify({'error': 'amount must be a number'}), 400

    if amount <= 0:
        return jsonify({'error': 'amount must be greater than zero'}), 400

    conn = get_db()
    cur = conn.execute(
        'INSERT INTO payments (event_id, amount, date, method, paid_by, created_at) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        (event_id, amount, data.get('date') or now_iso()[:10],
         data.get('method'), data.get('paid_by'), now_iso())
    )
    new_id = cur.lastrowid
    for it in items:
        conn.execute(
            'INSERT INTO payment_items (payment_id, product_title, amount) VALUES (?, ?, ?)',
            (new_id, it['product_title'], it['amount'])
        )
    conn.commit()
    conn.close()
    return jsonify({'id': new_id}), 201


@app.route('/api/payments/<int:payment_id>', methods=['DELETE'])
def delete_payment(payment_id):
    conn = get_db()
    conn.execute('DELETE FROM payments WHERE id=?', (payment_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
else:
    init_db()
