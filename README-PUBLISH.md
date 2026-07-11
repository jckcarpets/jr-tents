# Publishing J&R TENTS online (free)

After this, your app lives at a link like `https://jr-tents.onrender.com`
that works from any phone or computer, always connected to your Supabase
database. Two accounts are needed (both free): GitHub (holds your code)
and Render (runs the app).

## Step 1 — Put the code on GitHub

1. Go to https://github.com and sign up (free).
2. Click the **+** (top right) → **New repository**.
3. Name it `jr-tents`, choose **Private**, click **Create repository**.
4. On the new repo page click **uploading an existing file**.
5. Drag ALL the files and folders from your unzipped `eventsug-app`
   folder into the upload box (app_supabase.py, Procfile, render.yaml,
   requirements.txt, the `static` and `templates` folders, everything).
   NOTE: if the folders don't drag properly, open each folder and drag
   the files — GitHub keeps the folder structure when you drag folders
   from Explorer.
6. Click **Commit changes**.

## Step 2 — Deploy on Render

1. Go to https://render.com and sign up — choose **Sign in with GitHub**
   (easiest, it links the two automatically).
2. Click **New +** → **Web Service**.
3. Pick your `jr-tents` repository (click **Connect**).
4. Render reads the settings automatically. Confirm these fields:
   - Runtime: **Python 3**
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app_supabase:app`
   - Instance type: **Free**
5. Scroll to **Environment Variables**, click **Add Environment Variable**:
   - Key: `SUPABASE_DB_URL`
   - Value: your Supabase connection string (the same postgresql://...
     string you already use — with your real password in it)
6. Click **Deploy Web Service** and wait a few minutes.
7. When it says **Live**, your app is online at the URL shown at the top
   (something like `https://jr-tents.onrender.com`). Open it, create an
   entry, refresh — it stays, from any device.

## Good to know

- **Free plan sleep:** on Render's free plan the app naps after ~15 min of
  no visitors; the first visit after that takes ~30-60 seconds to wake up.
  Your data is never affected (it lives in Supabase).
- **Updating the app:** upload changed files to the GitHub repo (same
  drag-and-drop) — Render redeploys automatically.
- **IMPORTANT — the link is public.** Anyone who has the URL can open the
  app and see/edit your business data. Don't share the link. If you want
  a proper login screen so only you can get in, ask Claude to add one —
  recommended before sharing the link with anyone.
