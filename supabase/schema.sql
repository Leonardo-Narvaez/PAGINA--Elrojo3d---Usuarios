-- ============================================================
-- @Elrojo.3d — Esquema para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create extension if not exists "uuid-ossp";

-- CATEGORÍAS ---------------------------------------------------
create table if not exists public.categorias (
    id text primary key,
    nombre text not null,
    orden int not null default 0
);

-- PRODUCTOS ----------------------------------------------------
create table if not exists public.productos (
    id uuid primary key default uuid_generate_v4(),
    slug text unique not null,
    nombre text not null,
    descripcion text default '',
    descripcion_corta text default '',
    precio numeric not null default 0,
    img text default '',
    categoria text references public.categorias(id) on delete set null,
    disponible boolean not null default true,
    feats jsonb not null default '[]',
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

-- actualizar actualizado_en automáticamente ---------------------
create or replace function public.set_actualizado_en()
returns trigger as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_productos_actualizado on public.productos;
create trigger trg_productos_actualizado
before update on public.productos
for each row execute function public.set_actualizado_en();

-- SEGURIDAD (Row Level Security) --------------------------------
alter table public.categorias enable row level security;
alter table public.productos enable row level security;

-- lectura pública (el sitio ve solo lo disponible)
drop policy if exists "lectura publica categorias" on public.categorias;
create policy "lectura publica categorias"
on public.categorias for select using (true);

drop policy if exists "lectura publica productos disponibles" on public.productos;
create policy "lectura publica productos disponibles"
on public.productos for select using (disponible = true);

-- administración solo para usuarios autenticados
drop policy if exists "admin categorias crud" on public.categorias;
create policy "admin categorias crud"
on public.categorias for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "admin productos crud" on public.productos;
create policy "admin productos crud"
on public.productos for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- STORAGE (bucket público para imágenes) ------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "publico lectura imagenes" on storage.objects;
create policy "publico lectura imagenes"
on storage.objects for select
using (bucket_id = 'productos');

drop policy if exists "admin subir imagenes" on storage.objects;
create policy "admin subir imagenes"
on storage.objects for insert
with check (bucket_id = 'productos' and auth.role() = 'authenticated');

drop policy if exists "admin actualizar imagenes" on storage.objects;
create policy "admin actualizar imagenes"
on storage.objects for update
using (bucket_id = 'productos' and auth.role() = 'authenticated');

drop policy if exists "admin eliminar imagenes" on storage.objects;
create policy "admin eliminar imagenes"
on storage.objects for delete
using (bucket_id = 'productos' and auth.role() = 'authenticated');

-- DATOS INICIALES (opcional) ------------------------------------
insert into public.categorias (id, nombre, orden) values
    ('accesorios', 'Accesorios', 1),
    ('personalizados', 'Personalizados', 2),
    ('identificacion', 'Identificación', 3)
on conflict (id) do nothing;

-- CONFIGURACIÓN --------------------------------------------------
create table if not exists public.configuracion (
    clave text primary key,
    valor text not null default '',
    actualizado_en timestamptz not null default now()
);

alter table public.configuracion enable row level security;

drop policy if exists "lectura publica configuracion" on public.configuracion;
create policy "lectura publica configuracion"
on public.configuracion for select using (true);

drop policy if exists "admin configuracion crud" on public.configuracion;
create policy "admin configuracion crud"
on public.configuracion for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

insert into public.configuracion (clave, valor)
values ('whatsapp', '')
on conflict (clave) do nothing;

-- COLORES --------------------------------------------------------
create table if not exists public.colores (
    id uuid primary key default uuid_generate_v4(),
    nombre text unique not null,
    hex text not null default '#ffffff',
    activo boolean not null default true,
    orden int not null default 0,
    creado_en timestamptz not null default now()
);

alter table public.colores enable row level security;

drop policy if exists "lectura publica colores" on public.colores;
create policy "lectura publica colores"
on public.colores for select using (activo = true);

drop policy if exists "admin colores crud" on public.colores;
create policy "admin colores crud"
on public.colores for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

insert into public.colores (nombre, hex, activo, orden) values
    ('Negro', '#262626', true, 1),
    ('Rojo', '#ff3131', true, 2),
    ('Amarillo', '#ffd400', true, 3),
    ('Blanco', '#f5f5f5', true, 4),
    ('Azul', '#2b6bff', true, 5)
on conflict (nombre) do nothing;
