-- Etapa 7: registro de auditoría de cantidades, precios, extras, pagos y estados.
-- Lo escriben triggers (nadie lo puede editar ni saltear desde la app); lo leen los miembros del grupo.

create table public.audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,                       -- null = el sistema (cron, avisos…)
  tabla         text not null,
  accion        text not null check (accion in ('alta', 'cambio', 'baja', 'reset_clave')),
  order_id      uuid,                       -- sin FK: el registro sobrevive aunque se borre el pedido
  titulo_pedido text,
  antes         jsonb,
  despues       jsonb
);
create index audit_log_order_idx on public.audit_log (order_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select using (public.es_miembro());

create function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_order uuid;
  v_titulo text;
  v_producto text;
  v_concepto text;
  r record := coalesce(new, old);
begin
  if tg_table_name = 'orders' then
    v_order := r.id; v_titulo := r.titulo;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('titulo', old.titulo, 'estado', old.estado, 'proveedor', old.proveedor,
              'cobra_user_id', old.cobra_user_id, 'recibe_user_id', old.recibe_user_id, 'modo_reparto', old.modo_reparto, 'fecha_entrega', old.fecha_entrega) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('titulo', new.titulo, 'estado', new.estado, 'proveedor', new.proveedor,
              'cobra_user_id', new.cobra_user_id, 'recibe_user_id', new.recibe_user_id, 'modo_reparto', new.modo_reparto, 'fecha_entrega', new.fecha_entrega) end;

  elsif tg_table_name = 'order_items' then
    v_order := r.order_id;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('producto', old.producto, 'precio_bulto', old.precio_bulto,
              'unidades_por_bulto', old.unidades_por_bulto, 'bultos_total', old.bultos_total) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('producto', new.producto, 'precio_bulto', new.precio_bulto,
              'unidades_por_bulto', new.unidades_por_bulto, 'bultos_total', new.bultos_total) end;

  elsif tg_table_name = 'allocations' then
    select i.order_id, i.producto into v_order, v_producto from public.order_items i where i.id = r.order_item_id;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('producto', v_producto, 'user_id', old.user_id, 'bultos', old.bultos) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('producto', v_producto, 'user_id', new.user_id, 'bultos', new.bultos) end;

  elsif tg_table_name = 'extra_costs' then
    v_order := r.order_id;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('concepto', old.concepto, 'monto', old.monto, 'modo', old.modo) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('concepto', new.concepto, 'monto', new.monto, 'modo', new.modo) end;

  elsif tg_table_name = 'extra_cost_shares' then
    select x.order_id, x.concepto into v_order, v_concepto from public.extra_costs x where x.id = r.extra_cost_id;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('concepto', v_concepto, 'user_id', old.user_id, 'monto', old.monto) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('concepto', v_concepto, 'user_id', new.user_id, 'monto', new.monto) end;

  elsif tg_table_name = 'payments' then
    v_order := r.order_id;
    v_old := case when tg_op <> 'INSERT' then jsonb_build_object('user_id', old.user_id, 'monto', old.monto, 'estado', old.estado, 'medio', old.medio, 'fecha', old.fecha) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('user_id', new.user_id, 'monto', new.monto, 'estado', new.estado, 'medio', new.medio, 'fecha', new.fecha) end;
  end if;

  -- Borrado en cascada de un pedido: ya queda asentado en la baja del pedido.
  if v_order is null then return null; end if;
  if tg_op = 'UPDATE' and v_old = v_new then return null; end if;
  if v_titulo is null then select titulo into v_titulo from public.orders where id = v_order; end if;

  insert into public.audit_log (actor_id, tabla, accion, order_id, titulo_pedido, antes, despues)
  values (auth.uid(), tg_table_name,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
          v_order, v_titulo, v_old, v_new);
  return null;
end;
$$;

create trigger audit_orders             after insert or update or delete on public.orders             for each row execute function public.auditar();
create trigger audit_order_items        after insert or update or delete on public.order_items        for each row execute function public.auditar();
create trigger audit_allocations        after insert or update or delete on public.allocations        for each row execute function public.auditar();
create trigger audit_extra_costs        after insert or update or delete on public.extra_costs        for each row execute function public.auditar();
create trigger audit_extra_cost_shares  after insert or update or delete on public.extra_cost_shares  for each row execute function public.auditar();
create trigger audit_payments           after insert or update or delete on public.payments           for each row execute function public.auditar();

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke all on function public.auditar() from public, anon, authenticated;
