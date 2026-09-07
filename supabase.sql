-- Instalación nueva: Project -> SQL Editor -> New query -> pegar todo esto -> Run.

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  payer text not null,
  total numeric not null,
  items jsonb not null,
  shares jsonb not null,
  title text,
  category text,
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

-- Si ya habías corrido este script antes de que existiera la columna
-- "title", corré sólo esta línea en vez de todo lo de arriba:
-- alter table public.bills add column if not exists title text;

-- Pagos registrados manualmente ("Marcar como pagado" en la app), para
-- descontar deudas ya saldadas sin borrar el historial de compras.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  from_person text not null,
  to_person text not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table public.settlements enable row level security;

create policy "Allow all for authenticated users"
on public.settlements
for all
to authenticated
using (true)
with check (true);

-- Si ya habías corrido este script antes de que existiera la columna
-- "category", corré sólo esta línea en vez de todo lo de arriba:
-- alter table public.bills add column if not exists category text;
