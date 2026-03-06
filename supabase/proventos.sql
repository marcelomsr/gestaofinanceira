create table if not exists public.provento (
  id bigint generated always as identity primary key,
  ticker varchar(50) not null,
  tipo varchar(100) not null,
  valor numeric(18, 2) not null,
  data_com date null,
  data_pagamento date not null,
  created_at timestamptz not null default now()
);

alter table public.provento enable row level security;

create policy "anon_select_proventos"
on public.provento
for select
to anon
using (true);

create policy "anon_insert_proventos"
on public.provento
for insert
to anon
with check (true);

create policy "anon_update_proventos"
on public.provento
for update
to anon
using (true)
with check (true);

create policy "anon_delete_proventos"
on public.provento
for delete
to anon
using (true);
