-- Cobro en otro lugar: el pedido puede pagarse en el momento del retiro, sin que nadie del grupo
-- reciba el dinero. Con cobra_user_id = null no hay deudas entre miembros ni pagos en la app.
alter table public.orders alter column cobra_user_id drop not null;

-- Sin cobrador, "null = uid" da null (no false): se blindan los permisos para que eso nunca abra una puerta.
create or replace function public.guardar_pedido(p_order_id uuid, p_data jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id    uuid := p_order_id;
  it      jsonb;
  v_item  uuid;
  v_keep  uuid[] := '{}';
  v_idx   int := 0;
  v_mis   int;
begin
  if auth.uid() is null or not public.es_miembro() then
    raise exception 'No tenés permiso para esto.';
  end if;
  if jsonb_array_length(coalesce(p_data->'items', '[]'::jsonb)) = 0 then
    raise exception 'El pedido necesita al menos un producto.';
  end if;

  if v_id is null then
    insert into public.orders (titulo, proveedor, fecha, fecha_entrega, notas, organizador_id,
                               cobra_user_id, recibe_user_id, retiro_lugar, retiro_direccion, modo_reparto)
    values (
      trim(p_data->>'titulo'),
      nullif(trim(coalesce(p_data->>'proveedor', '')), ''),
      coalesce(nullif(p_data->>'fecha', '')::date, current_date),
      nullif(p_data->>'fecha_entrega', '')::date,
      nullif(trim(coalesce(p_data->>'notas', '')), ''),
      auth.uid(),
      nullif(p_data->>'cobra_user_id', '')::uuid,
      nullif(p_data->>'recibe_user_id', '')::uuid,
      nullif(trim(coalesce(p_data->>'retiro_lugar', '')), ''),
      nullif(trim(coalesce(p_data->>'retiro_direccion', '')), ''),
      coalesce(nullif(p_data->>'modo_reparto', ''), 'por_cantidad')::public.reparto_pedido
    ) returning id into v_id;
  else
    update public.orders set
      titulo         = trim(p_data->>'titulo'),
      proveedor      = nullif(trim(coalesce(p_data->>'proveedor', '')), ''),
      fecha          = coalesce(nullif(p_data->>'fecha', '')::date, fecha),
      fecha_entrega  = nullif(p_data->>'fecha_entrega', '')::date,
      notas          = nullif(trim(coalesce(p_data->>'notas', '')), ''),
      cobra_user_id  = nullif(p_data->>'cobra_user_id', '')::uuid,
      recibe_user_id = nullif(p_data->>'recibe_user_id', '')::uuid,
      retiro_lugar   = nullif(trim(coalesce(p_data->>'retiro_lugar', '')), ''),
      retiro_direccion = nullif(trim(coalesce(p_data->>'retiro_direccion', '')), ''),
      modo_reparto   = coalesce(nullif(p_data->>'modo_reparto', ''), 'por_cantidad')::public.reparto_pedido
    where id = v_id;
    if not found then
      raise exception 'No podés editar este pedido (solo el organizador, y mientras esté abierto).';
    end if;
  end if;

  for it in select * from jsonb_array_elements(p_data->'items') loop
    v_idx  := v_idx + 1;
    v_item := nullif(it->>'id', '')::uuid;
    if v_item is null then
      insert into public.order_items (order_id, orden, producto, precio_unitario, unidades_por_bulto, precio_bulto, bultos_total)
      values (v_id, v_idx, trim(it->>'producto'), nullif(it->>'precio_unitario', '')::bigint,
              (it->>'unidades_por_bulto')::int, (it->>'precio_bulto')::bigint, nullif(it->>'bultos_total', '')::int)
      returning id into v_item;
    else
      update public.order_items set
        orden = v_idx, producto = trim(it->>'producto'),
        precio_unitario = nullif(it->>'precio_unitario', '')::bigint,
        unidades_por_bulto = (it->>'unidades_por_bulto')::int,
        precio_bulto = (it->>'precio_bulto')::bigint,
        bultos_total = nullif(it->>'bultos_total', '')::int
      where id = v_item and order_id = v_id;
      if not found then raise exception 'Uno de los productos no existe en este pedido.'; end if;
    end if;
    v_keep := v_keep || v_item;

    v_mis := coalesce(nullif(it->>'mis_bultos', '')::int, 0);
    if p_order_id is null and v_mis > 0 then
      insert into public.allocations (order_item_id, user_id, bultos) values (v_item, auth.uid(), v_mis);
    end if;
  end loop;
  delete from public.order_items where order_id = v_id and not (id = any (v_keep));

  perform public._sincronizar_extras(v_id, p_data->'extras');
  return v_id;
end;
$$;

create or replace function public.registrar_pago(
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
  if o.cobra_user_id is null then
    raise exception 'En este pedido se paga en el momento, en otro lugar: no se cargan pagos en la app.';
  end if;
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

create or replace function public.confirmar_pago(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if not public.es_miembro() or not (coalesce(auth.uid() = public.cobra_de_pedido(p.order_id), false) or public.es_admin()) then
    raise exception 'Solo quien cobra (o un admin) puede confirmar pagos.';
  end if;
  if p.user_id = auth.uid() then raise exception 'No podés confirmar tu propio pago.'; end if;
  if p.estado = 'confirmado' then return; end if;
  update public.payments set estado = 'confirmado', confirmado_por = auth.uid(), confirmado_at = now()
   where id = p_payment_id;
end;
$$;

create or replace function public.eliminar_pago(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if not public.es_miembro() then raise exception 'No tenés permiso para esto.'; end if;
  if not (coalesce(auth.uid() = public.cobra_de_pedido(p.order_id), false) or public.es_admin()
          or (p.user_id = auth.uid() and p.estado = 'pendiente')) then
    raise exception 'No podés eliminar este pago.';
  end if;
  delete from public.payments where id = p_payment_id;
end;
$$;

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
       or coalesce(p_nuevo = 'saldado' and o.cobra_user_id = auth.uid(), false)) then
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
