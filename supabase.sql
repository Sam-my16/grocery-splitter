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

-- Si cambiás el nombre de alguna persona en js/supabase-config.js (el
-- array PEOPLE), corré esto UNA VEZ para que las compras y pagos ya
-- guardados usen el nombre nuevo (si no, quedan "huérfanos" y no suman
-- en los balances). Reemplazá 'Nahobe' y 'Nubi' por los nombres que
-- corresponda.
-- update public.bills
-- set payer = replace(payer, 'Nahobe', 'Nubi'),
--     shares = replace(shares::text, 'Nahobe', 'Nubi')::jsonb,
--     items = replace(items::text, 'Nahobe', 'Nubi')::jsonb
-- where payer = 'Nahobe' or shares::text like '%Nahobe%' or items::text like '%Nahobe%';
--
-- update public.settlements
-- set from_person = replace(from_person, 'Nahobe', 'Nubi'),
--     to_person = replace(to_person, 'Nahobe', 'Nubi')
-- where from_person = 'Nahobe' or to_person = 'Nahobe';
