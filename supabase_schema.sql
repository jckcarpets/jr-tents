-- ============================================================
-- J&R TENTS — Supabase database schema
-- Paste this whole file into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

create table if not exists clients (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  title text not null,
  code text,
  date date not null,
  end_date date,
  color text default '#e0793d',
  client_id bigint references clients (id) on delete set null,
  notes text,
  classification text default 'retail',
  category text,
  location text,
  tax_inclusive boolean default false,
  tax_type text default 'no_tax',
  discount_amount numeric default 0,
  discount_currency text default 'UGX',
  created_at timestamptz not null default now()
);

create table if not exists event_products (
  id bigint generated always as identity primary key,
  event_id bigint not null references events (id) on delete cascade,
  title text,
  dimensions text,
  days numeric default 1,
  qty numeric default 1,
  unit_price numeric default 0,
  sort_order int default 0
);

create table if not exists payments (
  id bigint generated always as identity primary key,
  event_id bigint not null references events (id) on delete cascade,
  amount numeric default 0,
  date date,
  method text,
  paid_by text,
  created_at timestamptz not null default now()
);

create table if not exists payment_items (
  id bigint generated always as identity primary key,
  payment_id bigint not null references payments (id) on delete cascade,
  product_title text,
  amount numeric default 0
);

create index if not exists idx_events_date on events (date);
create index if not exists idx_events_client on events (client_id);
create index if not exists idx_products_event on event_products (event_id);
create index if not exists idx_payments_event on payments (event_id);
create index if not exists idx_payment_items_payment on payment_items (payment_id);

-- The app talks to the database directly (not through Supabase's public
-- REST API), so we enable Row Level Security with NO policies. That locks
-- the auto-generated public API completely while the app's direct
-- connection (which bypasses RLS) keeps working.
alter table clients enable row level security;
alter table events enable row level security;
alter table event_products enable row level security;
alter table payments enable row level security;
alter table payment_items enable row level security;
