-- Corré esto en Supabase: Project -> SQL Editor -> New query -> pegar y Run.

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  payer text not null,
  total numeric not null,
  items jsonb not null,
  shares jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bills enable row level security;

-- Cualquier usuario logueado (incluye el login anónimo) puede leer/escribir.
-- Alcanza para una app de 3 personas de confianza.
create policy "Allow all for authenticated users"
on public.bills
for all
to authenticated
using (true)
with check (true);
