# Using Supabase as the database for J&R TENTS

This upgrade moves your data from the local `eventsug.db` file into a free
Supabase (cloud Postgres) database — so your clients and events are backed
up online and available from any computer you run the app on.

You'll use `app_supabase.py` instead of `app.py`. Everything else (the
calendar, invoices, all screens) is identical.

## Step 1 — Create the Supabase project

1. Go to https://supabase.com and sign up (free plan is fine).
2. Click **New project**.
3. Pick any name (e.g. `jr-tents`), set a strong **database password**
   (SAVE IT — you'll need it in Step 3), choose the region closest to you,
   and click **Create new project**. Wait a minute for it to provision.

## Step 2 — Create the tables

1. In your project, open **SQL Editor** (left menu).
2. Open the file `supabase_schema.sql` (included in this folder), copy ALL
   of it, paste it into the editor, and press **Run**.
3. You should see "Success". Check **Table Editor** — you'll now have
   `clients`, `events`, and `event_products` tables.

## Step 3 — Get your connection string

1. Click the **Connect** button at the top of the Supabase dashboard.
2. Under **Session pooler**, copy the URI. It looks like:

   postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres

3. Replace `[YOUR-PASSWORD]` with the database password from Step 1.

## Step 4 — Run the app against Supabase

Install the Postgres driver (one time):

    pip install psycopg2-binary

Then set the connection string and start the app:

**Windows (PowerShell):**

    $env:SUPABASE_DB_URL = "postgresql://postgres.abcdefghijk:YOURPASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
    python app_supabase.py

**macOS / Linux:**

    export SUPABASE_DB_URL="postgresql://postgres.abcdefghijk:YOURPASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
    python app_supabase.py

Open http://localhost:5000 — same app, now saving to the cloud. You can
confirm by opening Supabase's **Table Editor** and watching rows appear as
you create clients and events.

## Notes

- `app.py` (SQLite) still works if you ever want the offline local version;
  the two don't share data.
- The schema enables Row Level Security with no policies, which locks
  Supabase's auto-generated public API. Your app connects directly to the
  database, so it is not affected.
- Keep your connection string secret — anyone who has it can read your data.
- Supabase free-tier projects pause after ~1 week of inactivity; just click
  "Restore" in the dashboard if that happens.
