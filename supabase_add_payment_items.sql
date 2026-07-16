-- ============================================================
-- J&R TENTS — add per-product payment allocation
-- Run this ONCE in: Supabase Dashboard → SQL Editor → Run
-- (Safe to run even if you've run it before.)
-- ============================================================

create table if not exists payment_items (
  id bigint generated always as identity primary key,
  payment_id bigint not null references payments (id) on delete cascade,
  product_title text,
  amount numeric default 0
);

create index if not exists idx_payment_items_payment on payment_items (payment_id);

alter table payment_items enable row level security;
