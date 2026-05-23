create table if not exists public.transactions (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  payment_method text not null check (payment_method in ('cash', 'card')),
  category text not null,
  amount numeric not null check (amount >= 0),
  memo text not null default '',
  date date not null,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

drop policy if exists "Allow public read transactions" on public.transactions;
drop policy if exists "Allow public insert transactions" on public.transactions;
drop policy if exists "Allow public update transactions" on public.transactions;
drop policy if exists "Allow public delete transactions" on public.transactions;

create policy "Allow public read transactions"
on public.transactions for select
to anon
using (true);

create policy "Allow public insert transactions"
on public.transactions for insert
to anon
with check (true);

create policy "Allow public update transactions"
on public.transactions for update
to anon
using (true)
with check (true);

create policy "Allow public delete transactions"
on public.transactions for delete
to anon
using (true);
