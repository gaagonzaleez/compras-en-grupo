-- Etapa 5: avisos (bandeja dentro de la app, push y email de respaldo) y recordatorios de deuda.

create type public.tipo_aviso as enum (
  'pedido_nuevo', 'pedido_cerrado', 'pedido_reabierto', 'pedido_entregado',
  'pago_avisado', 'pago_confirmado', 'recordatorio_deuda'
);

create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tipo       public.tipo_aviso not null,
  titulo     text not null,
  cuerpo     text not null default '',
  url        text,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);
create index notificaciones_user_idx on public.notificaciones (user_id, created_at desc);

-- Dispositivos con push activado (una fila por navegador/celular).
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Qué avisos quiere recibir cada uno. Sin fila = todos activados.
create table public.notification_settings (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  desactivados    public.tipo_aviso[] not null default '{}',
  email_respaldo  boolean not null default true
);

-- Evita mandar el mismo recordatorio de deuda varias veces seguidas.
create table public.recordatorios (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  origen     text not null check (origen in ('manual', 'automatico')),
  enviado_at timestamptz not null default now()
);
create index recordatorios_idx on public.recordatorios (order_id, user_id, enviado_at desc);

alter table public.notificaciones         enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.notification_settings  enable row level security;
alter table public.recordatorios          enable row level security;

-- Los avisos los crea el servidor con la service_role; cada uno lee y marca como leídos los suyos.
create policy notificaciones_select on public.notificaciones for select using (user_id = auth.uid());
create policy notificaciones_update on public.notificaciones for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert with check (user_id = auth.uid() and public.es_miembro());
create policy push_delete on public.push_subscriptions for delete using (user_id = auth.uid());

create policy settings_select on public.notification_settings for select using (user_id = auth.uid());
create policy settings_insert on public.notification_settings for insert with check (user_id = auth.uid());
create policy settings_update on public.notification_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recordatorios: sin políticas = solo la service_role.

revoke all on public.notificaciones, public.push_subscriptions, public.notification_settings, public.recordatorios
  from anon, authenticated;
grant select, update (leida) on public.notificaciones to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_settings to authenticated;
