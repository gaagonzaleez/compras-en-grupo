-- Simula lo mínimo de Supabase (esquema auth, roles y auth.uid()) para probar las migraciones
-- contra un Postgres común. NO se aplica en Supabase real.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- En Supabase la service_role recibe todos los permisos por defecto sobre lo que se crea en public.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);
-- Igual que el auth.uid() de Supabase: lee el claim "sub" del JWT (o el GUC legado usado por los tests).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
  )::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Storage mínimo (solo lo que usan las migraciones).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant all on storage.objects, storage.buckets to service_role;
