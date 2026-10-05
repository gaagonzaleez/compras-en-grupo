\set ON_ERROR_STOP on
\set QUIET on

select t.nuevo_usuario('jorge', (select codigo_invitacion from group_settings)) as jorge \gset
select t.nuevo_usuario('karen', (select codigo_invitacion from group_settings)) as karen \gset

select set_config('request.jwt.claim.sub', :'jorge', false) \gset
set role authenticated;
select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Fideos', 'cobra_user_id', :'jorge', 'recibe_user_id', :'jorge',
  'items', jsonb_build_array(jsonb_build_object('producto','Spaghetti','unidades_por_bulto',20,'precio_bulto',8000,'mis_bultos',2)),
  'extras', jsonb_build_array(jsonb_build_object('concepto','Flete','monto',500,'modo','iguales')))) as pedido \gset
select id as item from order_items where order_id = :'pedido' \gset
select set_config('t.p', :'pedido', false) \gset
reset role;

select set_config('request.jwt.claim.sub', :'karen', false) \gset
set role authenticated;
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 3)));
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 5)));
do $$ declare r record; begin
  -- quién, cuándo y valor anterior de un cambio de cantidad
  select * into r from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'allocations' and accion = 'cambio' order by id desc limit 1;
  assert r.actor_id = current_setting('request.jwt.claim.sub')::uuid, 'queda registrado quién lo hizo';
  assert (r.antes ->> 'bultos')::int = 3 and (r.despues ->> 'bultos')::int = 5, 'valor anterior y nuevo';
  assert r.antes ->> 'producto' = 'Spaghetti' and r.titulo_pedido = 'Fideos';
  assert r.at > now() - interval '1 minute';
  assert (select count(*) from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'allocations' and accion = 'alta') = 2, 'altas de cantidades';
  -- la gente no puede tocar el registro
  perform t.expect_error($q$update audit_log set despues = '{}'$q$, '%permission denied%');
  perform t.expect_error($q$delete from audit_log$q$, '%permission denied%');
  perform t.expect_error($q$insert into audit_log (tabla, accion) values ('x','alta')$q$, '%permission denied%');
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'jorge', false) \gset
set role authenticated;
update order_items set precio_bulto = 8500 where id = :'item';
select public.cambiar_estado(:'pedido', 'cerrado');
select public.registrar_pago(:'pedido', :'karen', 1000, null, 'efectivo', null);
do $$ declare r record; begin
  select * into r from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'order_items' and accion = 'cambio' order by id desc limit 1;
  assert (r.antes ->> 'precio_bulto')::int = 8000 and (r.despues ->> 'precio_bulto')::int = 8500, 'cambio de precio auditado';
  select * into r from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'orders' and accion = 'cambio' order by id desc limit 1;
  assert r.antes ->> 'estado' = 'abierto' and r.despues ->> 'estado' = 'cerrado' and r.actor_id = current_setting('request.jwt.claim.sub')::uuid, 'cambio de estado auditado';
  select * into r from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'payments' order by id desc limit 1;
  assert r.accion = 'alta' and (r.despues ->> 'monto')::int = 1000 and r.actor_id = current_setting('request.jwt.claim.sub')::uuid, 'pago auditado';
  assert (select count(*) from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'extra_costs' and accion = 'alta') = 1, 'extra auditado';
  -- un UPDATE sin cambios reales (solo updated_at) no ensucia el log
  update orders set notas = notas where id = (select id from orders where titulo = 'Fideos');
  assert (select count(*) from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'orders' and accion = 'cambio') = 1;
end $$;
reset role;

-- al borrar el pedido el historial queda, con la baja del pedido
select set_config('request.jwt.claim.sub', :'karen', false) \gset
set role service_role;
delete from orders where titulo = 'Fideos';
do $$ begin
  assert exists (select 1 from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'orders' and accion = 'baja' and titulo_pedido = 'Fideos' and antes ->> 'estado' = 'cerrado'), 'queda la baja del pedido con su detalle';
  assert exists (select 1 from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'allocations' and accion = 'alta'), 'el historial sobrevive al pedido';
end $$;
reset role;
\echo 'OK: auditoría'
