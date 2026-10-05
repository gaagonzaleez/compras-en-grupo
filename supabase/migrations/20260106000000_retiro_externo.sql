-- Retiro en un lugar que no es de un miembro: el pedido puede recibirse en un negocio externo
-- (nombre + dirección) en vez de en un miembro del grupo. O hay un miembro, o hay un lugar externo.
alter table public.orders
  alter column recibe_user_id drop not null,
  add column retiro_lugar text,
  add column retiro_direccion text,
  add constraint orders_recibe_ck check (
    recibe_user_id is not null and retiro_lugar is null and retiro_direccion is null
    or recibe_user_id is null and length(trim(coalesce(retiro_lugar, ''))) > 0
  );

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
      (p_data->>'cobra_user_id')::uuid,
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
      cobra_user_id  = (p_data->>'cobra_user_id')::uuid,
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

create or replace function public.auditar() returns trigger
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
              'cobra_user_id', old.cobra_user_id, 'recibe_user_id', old.recibe_user_id, 'retiro_lugar', old.retiro_lugar, 'retiro_direccion', old.retiro_direccion, 'modo_reparto', old.modo_reparto, 'fecha_entrega', old.fecha_entrega) end;
    v_new := case when tg_op <> 'DELETE' then jsonb_build_object('titulo', new.titulo, 'estado', new.estado, 'proveedor', new.proveedor,
              'cobra_user_id', new.cobra_user_id, 'recibe_user_id', new.recibe_user_id, 'retiro_lugar', new.retiro_lugar, 'retiro_direccion', new.retiro_direccion, 'modo_reparto', new.modo_reparto, 'fecha_entrega', new.fecha_entrega) end;

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
