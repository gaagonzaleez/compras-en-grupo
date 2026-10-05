-- Etapa 4: pagos, fecha real de entrega y recordatorios de deuda.

create type public.medio_pago  as enum ('efectivo', 'transferencia', 'otro');
create type public.estado_pago as enum ('pendiente', 'confirmado');

alter table public.orders add column entregado_at timestamptz;

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  user_id        uuid not null references public.profiles (id),      -- quien paga
  monto          bigint not null check (monto > 0),                   -- pesos enteros
  fecha          date not null default current_date,
  medio          public.medio_pago not null default 'transferencia',
  nota           text,
  estado         public.estado_pago not null default 'pendiente',
  registrado_por uuid not null references public.profiles (id),
  confirmado_por uuid references public.profiles (id),
  confirmado_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create index payments_user_idx on public.payments (user_id);

alter table public.payments enable row level security;
-- Se lee con RLS; se escribe solo con las funciones de abajo.
create policy payments_select on public.payments for select using (public.es_miembro());

-- Cantidad de días de espera antes del recordatorio (la tabla group_settings es solo para admins).
create function public.dias_recordatorio() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select dias_recordatorio from public.group_settings where id = 1), 7);
$$;

create function public.cobra_de_pedido(p_order uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select cobra_user_id from public.orders where id = p_order;
$$;

-- Registra un pago. Si lo carga quien paga queda "pendiente" hasta que quien cobra lo confirma;
-- si lo carga quien cobra (o un admin por otra persona) queda confirmado.
create function public.registrar_pago(
  p_order_id uuid, p_user_id uuid, p_monto bigint, p_fecha date, p_medio public.medio_pago, p_nota text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  v_pagador uuid := coalesce(p_user_id, auth.uid());
  v_confirma boolean;
  v_id uuid;
begin
  if auth.uid() is null or not public.es_miembro() then raise exception 'No tenés permiso para esto.'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'El pedido no existe.'; end if;
  if o.estado = 'abierto' then raise exception 'El pedido todavía está abierto: los pagos se cargan cuando se cierra.'; end if;
  if o.estado = 'saldado' then raise exception 'El pedido ya está saldado.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor a $0.'; end if;
  if v_pagador = o.cobra_user_id then raise exception 'Quien cobra no se paga a sí mismo: su parte ya se considera pagada.'; end if;
  if not exists (select 1 from public.profiles where id = v_pagador and activo) then
    raise exception 'Ese miembro no está activo.';
  end if;
  if not exists (select 1 from public.allocations a join public.order_items i on i.id = a.order_item_id
                  where i.order_id = o.id and a.user_id = v_pagador)
     and not exists (select 1 from public.extra_cost_shares s join public.extra_costs x on x.id = s.extra_cost_id
                      where x.order_id = o.id and s.user_id = v_pagador) then
    raise exception 'Esa persona no participa en este pedido.';
  end if;

  if v_pagador = auth.uid() then
    v_confirma := false;                                   -- nadie confirma su propio pago
  elsif auth.uid() = o.cobra_user_id or public.es_admin() then
    v_confirma := true;
  else
    raise exception 'Solo quien cobra (o un admin) puede cargar el pago de otra persona.';
  end if;

  insert into public.payments (order_id, user_id, monto, fecha, medio, nota, estado, registrado_por, confirmado_por, confirmado_at)
  values (p_order_id, v_pagador, p_monto, coalesce(p_fecha, current_date), coalesce(p_medio, 'transferencia'),
          nullif(trim(coalesce(p_nota, '')), ''),
          case when v_confirma then 'confirmado'::public.estado_pago else 'pendiente'::public.estado_pago end,
          auth.uid(), case when v_confirma then auth.uid() end, case when v_confirma then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.confirmar_pago(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if not public.es_miembro() or not (auth.uid() = public.cobra_de_pedido(p.order_id) or public.es_admin()) then
    raise exception 'Solo quien cobra (o un admin) puede confirmar pagos.';
  end if;
  if p.user_id = auth.uid() then raise exception 'No podés confirmar tu propio pago.'; end if;
  if p.estado = 'confirmado' then return; end if;
  update public.payments set estado = 'confirmado', confirmado_por = auth.uid(), confirmado_at = now()
   where id = p_payment_id;
end;
$$;

-- Quien pagó borra su pago mientras esté pendiente; quien cobra (o un admin) puede rechazar/borrar cualquiera.
create function public.eliminar_pago(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if not public.es_miembro() then raise exception 'No tenés permiso para esto.'; end if;
  if not (auth.uid() = public.cobra_de_pedido(p.order_id) or public.es_admin()
          or (p.user_id = auth.uid() and p.estado = 'pendiente')) then
    raise exception 'No podés eliminar este pago.';
  end if;
  delete from public.payments where id = p_payment_id;
end;
$$;

-- cambiar_estado: ahora guarda la fecha real de entrega y quien cobra puede marcar "saldado".
create or replace function public.cambiar_estado(p_order_id uuid, p_nuevo public.estado_pedido) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  v_ok boolean;
  v_pasados text;
  v_mal text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if not public.es_miembro() or not (
       public.es_admin() or o.organizador_id = auth.uid()
       or (p_nuevo = 'saldado' and o.cobra_user_id = auth.uid())) then
    raise exception 'Solo el organizador o un admin puede cambiar el estado del pedido.';
  end if;

  v_ok := (o.estado, p_nuevo) in (
    ('abierto', 'cerrado'), ('cerrado', 'abierto'), ('cerrado', 'comprado'),
    ('comprado', 'entregado'), ('entregado', 'saldado'));
  if not v_ok then
    raise exception 'No se puede pasar de "%" a "%".', o.estado, p_nuevo;
  end if;

  if p_nuevo = 'cerrado' then
    if not exists (select 1 from public.allocations a join public.order_items i on i.id = a.order_item_id
                   where i.order_id = o.id) then
      raise exception 'Nadie se anotó todavía: no hay nada para cerrar.';
    end if;
    select string_agg(i.producto, ', ') into v_pasados
      from public.order_items i
     where i.order_id = o.id and i.bultos_total is not null
       and (select coalesce(sum(a.bultos), 0) from public.allocations a where a.order_item_id = i.id) > i.bultos_total;
    if v_pasados is not null then
      raise exception 'Se anotaron más bultos de los disponibles en: %.', v_pasados;
    end if;
    select string_agg(x.concepto, ', ') into v_mal
      from public.extra_costs x
     where x.order_id = o.id and x.modo = 'manual'
       and (select coalesce(sum(s.monto), 0) from public.extra_cost_shares s where s.extra_cost_id = x.id) <> x.monto;
    if v_mal is not null then
      raise exception 'Los montos manuales no suman el total en: %.', v_mal;
    end if;
  end if;

  perform set_config('app.cambio_estado', '1', true);
  update public.orders
     set estado = p_nuevo,
         entregado_at = case when p_nuevo = 'entregado' then now() else entregado_at end
   where id = p_order_id;
  perform set_config('app.cambio_estado', '', true);
end;
$$;

-- Permisos
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
revoke all on function public.dias_recordatorio(), public.cobra_de_pedido(uuid),
  public.registrar_pago(uuid, uuid, bigint, date, public.medio_pago, text),
  public.confirmar_pago(uuid), public.eliminar_pago(uuid),
  public.cambiar_estado(uuid, public.estado_pedido) from public, anon, authenticated;
grant execute on function public.dias_recordatorio(), public.cobra_de_pedido(uuid),
  public.registrar_pago(uuid, uuid, bigint, date, public.medio_pago, text),
  public.confirmar_pago(uuid), public.eliminar_pago(uuid),
  public.cambiar_estado(uuid, public.estado_pedido) to authenticated;
