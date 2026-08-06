-- ============================================================
-- @Elrojo.3d — Migración: una sola sesión activa por usuario
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Impide múltiples sesiones: cada login reemplaza la sesión
-- anterior del mismo usuario (el panel la detecta y la cierra).
-- ============================================================

create table if not exists public.sesiones_activas (
    user_id uuid primary key references auth.users(id) on delete cascade,
    token text not null,
    creada_en timestamptz not null default now()
);

alter table public.sesiones_activas enable row level security;

-- cada usuario solo lee/crea/actualiza/elimina SU sesión
drop policy if exists "usuario gestiona su sesion" on public.sesiones_activas;
create policy "usuario gestiona su sesion"
on public.sesiones_activas for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ============================================================
-- REGISTRO: desactiva el registro público en
-- Supabase Dashboard > Authentication > Providers > Email
-- ("Allow new users to sign up" = OFF).
-- El único usuario (admin) se crea manualmente en:
-- Authentication > Users > Add user (email + contraseña).
-- ============================================================