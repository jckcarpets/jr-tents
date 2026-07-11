[README.md](https://github.com/user-attachments/files/29917413/README.md)
# J&R TENTS

A small events/decor business management app: a color-coded calendar of bookings
(month and list views) plus a client directory. Data is stored locally in a
SQLite database file (`eventsug.db`) that's created automatically the first
time you run the app.

## Running it

You need Python 3.9+ installed.

```bash
cd eventsug-app
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000** in your browser.

The database file `eventsug.db` will be created next to `app.py` on first
run. It's just a regular SQLite file, so you can back it up by copying it,
or open it with any SQLite browser if you want to inspect the raw data.

## What's included

- **Dashboard** — a month calendar (like a shared events calendar) showing
  every booked event as a color-coded pill, plus a list view. Click any day
  to add an event, click an existing event to edit or delete it.
- **Clients** — a simple client directory (name, phone, email, address,
  notes). Events can optionally be linked to a client.

## Not included yet

Payments, Vendors, Expenses, Purchase Orders and Bills are shown in the
sidebar as placeholders (matching the layout of the reference app) but
aren't functional yet — this first version focused on the calendar and
clients, per your request. Ask Claude to build out any of these next.

## Notes for developers

- Backend: Flask + SQLite (Python's built-in `sqlite3` module — no separate
  database server needed).
- Frontend: plain HTML/CSS/JS (no build step, no framework) served directly
  by Flask from `templates/` and `static/`.
- API routes are under `/api/clients` and `/api/events` (standard REST:
  GET/POST/PUT/DELETE).
