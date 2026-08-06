-- ============================================================
-- @Elrojo.3d — Tabla de colores disponibles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Agrega la gestión de colores del personalizador.
-- ============================================================

create table if not exists public.colores (
    id uuid primary key default uuid_generate_v4(),
    nombre text unique not null,
    hex text not null default '#ffffff',
    activo boolean not null default true,
    orden int not null default 0,
    creado_en timestamptz not null default now()
);

alter table public.colores enable row level security;

-- el sitio lee solo los colores activos
drop policy if exists "lectura publica colores" on public.colores;
create policy "lectura publica colores"
on public.colores for select using (activo = true);

-- administración solo para usuarios autenticados
drop policy if exists "admin colores crud" on public.colores;
create policy "admin colores crud"
on public.colores for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- datos iniciales
insert into public.colores (nombre, hex, activo, orden) values
    ('Negro', '#262626', true, 1),
    ('Rojo', '#ff3131', true, 2),
    ('Amarillo', '#ffd400', true, 3),
    ('Blanco', '#f5f5f5', true, 4),
    ('Azul', '#2b6bff', true, 5)
on conflict (nombre) do nothing;
