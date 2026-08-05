-- ============================================================
-- @Elrojo.3d — Migración: configuración (número de WhatsApp)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.configuracion (
    clave text primary key,
    valor text not null default '',
    actualizado_en timestamptz not null default now()
);

alter table public.configuracion enable row level security;

-- lectura pública: el sitio necesita el número para abrir WhatsApp
drop policy if exists "lectura publica configuracion" on public.configuracion;
create policy "lectura publica configuracion"
on public.configuracion for select using (true);

-- administración: solo usuarios autenticados
drop policy if exists "admin configuracion crud" on public.configuracion;
create policy "admin configuracion crud"
on public.configuracion for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- fila inicial (déjala vacía y ponla desde el panel)
insert into public.configuracion (clave, valor)
values ('whatsapp', '')
on conflict (clave) do nothing;
