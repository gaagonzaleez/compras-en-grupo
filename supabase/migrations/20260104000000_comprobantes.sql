-- Etapa 6: comprobantes (fotos de facturas y de pagos) en Supabase Storage.

create table public.attachments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,   -- opcional: comprobante de un pago
  path       text not null unique,                                      -- ruta dentro del bucket
  nombre     text not null,
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes      int not null check (bytes > 0 and bytes <= 8388608),
  subido_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index attachments_order_idx on public.attachments (order_id);

create function public.participa_en_pedido(p_order uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = p_order
                  and (o.organizador_id = p_user or o.cobra_user_id = p_user or o.recibe_user_id = p_user))
      or exists (select 1 from public.allocations a join public.order_items i on i.id = a.order_item_id
                  where i.order_id = p_order and a.user_id = p_user);
$$;

alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select using (public.es_miembro());
-- Suben quienes participan del pedido (organizan, cobran, reciben o compran) y los admins.
create policy attachments_insert on public.attachments for insert
  with check (public.es_miembro() and subido_por = auth.uid()
              and (public.es_admin() or public.participa_en_pedido(order_id, auth.uid())));
-- Borra quien lo subió, el organizador del pedido o un admin.
create policy attachments_delete on public.attachments for delete
  using (public.es_miembro() and (subido_por = auth.uid() or public.es_admin()
         or public.organizador_de_pedido(order_id) = auth.uid()));

revoke all on public.attachments from anon, authenticated;
grant select, insert, delete on public.attachments to authenticated;
revoke all on function public.participa_en_pedido(uuid, uuid) from public, anon, authenticated;
grant execute on function public.participa_en_pedido(uuid, uuid) to authenticated;

-- Bucket privado: los archivos se ven con links firmados que genera el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy comprobantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and public.es_miembro());
create policy comprobantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.es_miembro());
-- Sin política de borrado: los archivos los borra el servidor (service_role) después de chequear permisos.
