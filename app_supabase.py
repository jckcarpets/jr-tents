"""J&R TENTS app — Supabase (Postgres) edition.

Identical to app.py but stores everything in your Supabase database instead
of a local SQLite file. Point it at Supabase with the SUPABASE_DB_URL
environment variable (falls back to DATABASE_URL), e.g.:

  # Windows (PowerShell)
  $env:SUPABASE_DB_URL = "postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
  python app_supabase.py

  # macOS / Linux
  export SUPABASE_DB_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
  python app_supabase.py

See README-SUPABASE.md for the full setup walkthrough.
"""

from flask import Flask, request, jsonify, render_template
import os
import random
import string
import datetime
from decimal import Decimal

import psycopg2
import psycopg2.extras
import psycopg2.pool

app = Flask(__name__)

DB_URL = os.environ.get('SUPABASE_DB_URL') or os.environ.get('DATABASE_URL')
if not DB_URL:
    raise SystemExit(
        'Set the SUPABASE_DB_URL environment variable to your Supabase '
        'connection string (Dashboard -> Connect -> Session pooler URI). '
        'See README-SUPABASE.md.'
    )


_POOL = None


def _pool():
    global _POOL
    if _POOL is None:
        _POOL = psycopg2.pool.ThreadedConnectionPool(
            1, 4, DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return _POOL


def get_db():
    """Borrow a pooled connection (much faster than opening a new one per
    request). A quick ping validates it; dead connections are replaced."""
    for _ in range(2):
        try:
            conn = _pool().getconn()
        except Exception:
            break
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT 1')
            conn.rollback()
            return conn
        except Exception:
            try:
                _pool().putconn(conn, close=True)
            except Exception:
                pass
    # last resort: direct connection
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def put_db(conn):
    """Return a connection to the pool (used instead of closing it)."""
    try:
        conn.rollback()
        _pool().putconn(conn)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass


def _clean(value):
    """Make psycopg2 values JSON-friendly."""
    if isinstance(value, Decimal):
        f = float(value)
        return int(f) if f.is_integer() else f
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


def clean_row(row):
    return {k: _clean(v) for k, v in dict(row).items()}


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
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM clients ORDER BY lower(name)')
        rows = cur.fetchall()
    put_db(conn)
    return jsonify([clean_row(r) for r in rows])


@app.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM clients WHERE id=%s', (client_id,))
        row = cur.fetchone()
    put_db(conn)
    if not row:
        return jsonify({'error': 'not found'}), 404
    return jsonify(clean_row(row))


@app.route('/api/clients', methods=['POST'])
def create_client():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO clients (name, phone, email, address, notes) '
            'VALUES (%s, %s, %s, %s, %s) RETURNING id',
            (name, data.get('phone'), data.get('email'), data.get('address'), data.get('notes'))
        )
        new_id = cur.fetchone()['id']
    conn.commit()
    put_db(conn)
    return jsonify({'id': new_id}), 201


@app.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE clients SET name=%s, phone=%s, email=%s, address=%s, notes=%s WHERE id=%s',
            (name, data.get('phone'), data.get('email'), data.get('address'), data.get('notes'), client_id)
        )
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('DELETE FROM clients WHERE id=%s', (client_id,))
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


# ---------- Events ----------

@app.route('/api/events', methods=['GET'])
def get_events():
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('''
            SELECT events.*, clients.name AS client_name
            FROM events LEFT JOIN clients ON events.client_id = clients.id
            ORDER BY date
        ''')
        rows = cur.fetchall()
        cur.execute('''
            SELECT event_id, COALESCE(SUM(days * qty * unit_price), 0) AS subtotal
            FROM event_products GROUP BY event_id
        ''')
        sub_rows = cur.fetchall()
        cur.execute('''
            SELECT event_id, COALESCE(SUM(amount), 0) AS paid
            FROM payments GROUP BY event_id
        ''')
        pay_rows = cur.fetchall()
    put_db(conn)
    subtotals = {r['event_id']: float(r['subtotal']) for r in sub_rows}
    paids = {r['event_id']: float(r['paid']) for r in pay_rows}
    out = []
    for r in rows:
        d = clean_row(r)
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
    with conn.cursor() as cur:
        cur.execute('''
            SELECT events.*, clients.name AS client_name, clients.phone AS client_phone
            FROM events LEFT JOIN clients ON events.client_id = clients.id
            WHERE events.id=%s
        ''', (event_id,))
        row = cur.fetchone()
        if not row:
            put_db(conn)
            return jsonify({'error': 'not found'}), 404
        cur.execute(
            'SELECT * FROM event_products WHERE event_id=%s ORDER BY sort_order, id',
            (event_id,)
        )
        products = cur.fetchall()
        cur.execute(
            'SELECT * FROM payments WHERE event_id=%s ORDER BY date, id',
            (event_id,)
        )
        payments = cur.fetchall()
        cur.execute('''
            SELECT payment_items.* FROM payment_items
            JOIN payments ON payment_items.payment_id = payments.id
            WHERE payments.event_id=%s
        ''', (event_id,))
        items = cur.fetchall()
    put_db(conn)

    data = clean_row(row)
    data['products'] = [clean_row(p) for p in products]

    # Attach each payment's product allocation items
    items_by_payment = {}
    paid_by_title = {}
    for it in items:
        d = clean_row(it)
        items_by_payment.setdefault(d['payment_id'], []).append(d)
        title = (d.get('product_title') or '').strip()
        paid_by_title[title] = paid_by_title.get(title, 0.0) + float(d.get('amount') or 0)
    payments_out = []
    for p in payments:
        pd = clean_row(p)
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


def _save_products(cur, event_id, products):
    cur.execute('DELETE FROM event_products WHERE event_id=%s', (event_id,))
    for idx, p in enumerate(products or []):
        title = (p.get('title') or '').strip()
        if not title:
            continue
        cur.execute(
            'INSERT INTO event_products (event_id, title, dimensions, days, qty, unit_price, sort_order) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s)',
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
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM clients WHERE id=%s', (client_id,))
        client = cur.fetchone()
        if not client:
            put_db(conn)
            return jsonify({'error': 'client not found'}), 400

        code = (data.get('code') or '').strip() or gen_event_code()

        cur.execute(
            'INSERT INTO events (title, code, date, end_date, color, client_id, notes, '
            'classification, category, location, tax_inclusive, tax_type, discount_amount, '
            'discount_currency) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) '
            'RETURNING id',
            (client['name'], code, date, data.get('end_date') or None,
             data.get('color') or '#e0793d', client_id, data.get('notes'),
             data.get('classification') or 'retail', data.get('category'), data.get('location'),
             bool(data.get('tax_inclusive')), data.get('tax_type') or 'no_tax',
             data.get('discount_amount') or 0, data.get('discount_currency') or 'UGX')
        )
        new_id = cur.fetchone()['id']
        _save_products(cur, new_id, data.get('products'))
    conn.commit()
    put_db(conn)
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
    with conn.cursor() as cur:
        cur.execute('SELECT * FROM clients WHERE id=%s', (client_id,))
        client = cur.fetchone()
        if not client:
            put_db(conn)
            return jsonify({'error': 'client not found'}), 400

        cur.execute(
            'UPDATE events SET title=%s, code=%s, date=%s, end_date=%s, color=%s, client_id=%s, '
            'notes=%s, classification=%s, category=%s, location=%s, tax_inclusive=%s, '
            'tax_type=%s, discount_amount=%s, discount_currency=%s WHERE id=%s',
            (client['name'], data.get('code'), date, data.get('end_date') or None,
             data.get('color') or '#e0793d', client_id, data.get('notes'),
             data.get('classification') or 'retail', data.get('category'), data.get('location'),
             bool(data.get('tax_inclusive')), data.get('tax_type') or 'no_tax',
             data.get('discount_amount') or 0, data.get('discount_currency') or 'UGX', event_id)
        )
        _save_products(cur, event_id, data.get('products'))
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('DELETE FROM events WHERE id=%s', (event_id,))
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


# ---------- Payments ----------

@app.route('/api/payments', methods=['GET'])
def get_payments():
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('''
            SELECT payments.*, events.code AS event_code, events.title AS event_title,
                   clients.name AS client_name
            FROM payments
            LEFT JOIN events ON payments.event_id = events.id
            LEFT JOIN clients ON events.client_id = clients.id
            ORDER BY payments.date DESC, payments.id DESC
        ''')
        rows = cur.fetchall()
    put_db(conn)
    return jsonify([clean_row(r) for r in rows])


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
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO payments (event_id, amount, date, method, paid_by) '
            'VALUES (%s, %s, %s, %s, %s) RETURNING id',
            (event_id, amount, data.get('date'), data.get('method'), data.get('paid_by'))
        )
        new_id = cur.fetchone()['id']
        for it in items:
            cur.execute(
                'INSERT INTO payment_items (payment_id, product_title, amount) '
                'VALUES (%s, %s, %s)',
                (new_id, it['product_title'], it['amount'])
            )
    conn.commit()
    put_db(conn)
    return jsonify({'id': new_id}), 201


@app.route('/api/payments/<int:payment_id>', methods=['PUT'])
def update_payment(payment_id):
    data = request.get_json(force=True)

    raw_items = data.get('items') or []
    items = []
    for it in raw_items:
        try:
            amt = float(it.get('amount') or 0)
        except (TypeError, ValueError):
            amt = 0
        if amt > 0:
            items.append({'product_title': (it.get('product_title') or '').strip(), 'amount': amt})

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
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM payments WHERE id=%s', (payment_id,))
        if not cur.fetchone():
            put_db(conn)
            return jsonify({'error': 'not found'}), 404
        cur.execute(
            'UPDATE payments SET amount=%s, date=%s, method=%s, paid_by=%s WHERE id=%s',
            (amount, data.get('date'), data.get('method'), data.get('paid_by'), payment_id)
        )
        cur.execute('DELETE FROM payment_items WHERE payment_id=%s', (payment_id,))
        for it in items:
            cur.execute(
                'INSERT INTO payment_items (payment_id, product_title, amount) '
                'VALUES (%s, %s, %s)',
                (payment_id, it['product_title'], it['amount'])
            )
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


@app.route('/api/payments/<int:payment_id>', methods=['DELETE'])
def delete_payment(payment_id):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute('DELETE FROM payments WHERE id=%s', (payment_id,))
    conn.commit()
    put_db(conn)
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
