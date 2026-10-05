\set ON_ERROR_STOP on
\set QUIET on

select t.nuevo_usuario('lola', (select codigo_invitacion from group_settings)) as lola \gset

select set_config('request.jwt.claim.sub', :'lola', false) \gset
set role authenticated;

-- retiro en un negocio que no es miembro: sin recibe_user_id, con nombre y dirección
select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Limpieza', 'cobra_user_id', :'lola', 'recibe_user_id', null,
  'retiro_lugar', '  Distribuidora Norte ', 'retiro_direccion', 'Av. Siempreviva 742',
  'items', jsonb_build_array(jsonb_build_object('producto','Lavandina','unidades_por_bulto',12,'precio_bulto',9000)))) as pedido \gset
select set_config('t.p', :'pedido', false) \gset
do $$ declare o record; begin
  select * into o from orders where id = current_setting('t.p')::uuid;
  assert o.recibe_user_id is null, 'sin miembro que recibe';
  assert o.retiro_lugar = 'Distribuidora Norte' and o.retiro_direccion = 'Av. Siempreviva 742', 'lugar y dirección guardados (recortados)';
end $$;

-- la dirección es opcional
select public.guardar_pedido(current_setting('t.p')::uuid, jsonb_build_object(
  'titulo', 'Limpieza', 'cobra_user_id', :'lola', 'recibe_user_id', null, 'retiro_lugar', 'Kiosco Sur', 'retiro_direccion', '',
  'items', jsonb_build_array(jsonb_build_object('id', (select id from order_items where order_id = current_setting('t.p')::uuid),
     'producto','Lavandina','unidades_por_bulto',12,'precio_bulto',9000))));
do $$ begin
  assert (select retiro_lugar from orders where id = current_setting('t.p')::uuid) = 'Kiosco Sur';
  assert (select retiro_direccion from orders where id = current_setting('t.p')::uuid) is null, 'dirección vacía = null';
  -- queda en la auditoría
  assert exists (select 1 from audit_log where order_id = current_setting('t.p')::uuid and tabla = 'orders' and accion = 'cambio'
                 and despues ->> 'retiro_lugar' = 'Kiosco Sur' and antes ->> 'retiro_lugar' = 'Distribuidora Norte'), 'auditoría del lugar';
end $$;

-- sin miembro y sin lugar: no se puede
do $$ begin
  perform t.expect_error(format($q$select public.guardar_pedido(null, jsonb_build_object(
    'titulo','X','cobra_user_id',%L,'recibe_user_id',null,'retiro_lugar','  ',
    'items', jsonb_build_array(jsonb_build_object('producto','P','unidades_por_bulto',1,'precio_bulto',100))))$q$, current_setting('request.jwt.claim.sub')), '%orders_recibe_ck%');
end $$;

-- con miembro y además lugar externo: tampoco (o uno o el otro)
do $$ begin
  perform t.expect_error(format($q$select public.guardar_pedido(null, jsonb_build_object(
    'titulo','X','cobra_user_id',%1$L,'recibe_user_id',%1$L,'retiro_lugar','Otro',
    'items', jsonb_build_array(jsonb_build_object('producto','P','unidades_por_bulto',1,'precio_bulto',100))))$q$, current_setting('request.jwt.claim.sub')), '%orders_recibe_ck%');
end $$;
reset role;
\echo 'OK: retiro externo'
