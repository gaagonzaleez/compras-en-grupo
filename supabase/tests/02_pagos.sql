\set ON_ERROR_STOP on
\set QUIET on
-- Usa los helpers del schema "t" creados en 01_rls_and_rpc.sql

select t.nuevo_usuario('pau', (select codigo_invitacion from group_settings)) as pau \gset
select t.nuevo_usuario('quique', (select codigo_invitacion from group_settings)) as quique \gset
select t.nuevo_usuario('rita', (select codigo_invitacion from group_settings)) as rita \gset
select id as admin from profiles where rol = 'admin' \gset

-- pedido organizado por pau; cobra quique
select set_config('request.jwt.claim.sub', :'pau', false) \gset
set role authenticated;
select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Limpieza', 'cobra_user_id', :'quique', 'recibe_user_id', :'pau',
  'items', jsonb_build_array(jsonb_build_object('producto','Lavandina','unidades_por_bulto',12,'precio_bulto',10000,'mis_bultos',3)))) as pedido \gset
select id as item from order_items where order_id = :'pedido' \gset
select public.guardar_cantidades(:'pedido', :'rita', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 2)));
select public.guardar_cantidades(:'pedido', :'quique', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 1)));
do $$ begin
  perform t.expect_error(format($q$select public.registrar_pago(%L, null, 1000, null, 'efectivo', null)$q$, (select id from orders where titulo='Limpieza')), '%todavía está abierto%');
end $$;
select public.cambiar_estado(:'pedido', 'cerrado');
reset role;

-- rita avisa que pagó: queda pendiente
select set_config('request.jwt.claim.sub', :'rita', false) \gset
set role authenticated;
select public.registrar_pago(:'pedido', null, 20000, null, 'transferencia', 'Mercado Pago') as pago \gset
select set_config('t.pago', :'pago', false) \gset
do $$ begin
  assert (select estado from payments) = 'pendiente', 'el pago de uno mismo queda pendiente';
  assert (select count(*) from payments) = 1;
  perform t.expect_error(format($q$select public.confirmar_pago(%L)$q$, (select id from payments)), '%Solo quien cobra%');
  perform t.expect_error(format($q$select public.registrar_pago(%L, %L, 5, null, 'efectivo', null)$q$, (select id from orders where titulo='Limpieza'), (select id from profiles where nombre='pau')), '%Solo quien cobra%');
  perform t.expect_error(format($q$insert into payments(order_id,user_id,monto,registrado_por) values (%L,%L,1,%L)$q$, (select id from orders where titulo='Limpieza'), (select id from profiles where nombre='rita'), (select id from profiles where nombre='rita')), '%permission denied%');
end $$;
reset role;

-- quien cobra no se puede registrar pagos a sí mismo; confirma el de rita y carga el de pau
select set_config('request.jwt.claim.sub', :'quique', false) \gset
set role authenticated;
do $$ begin
  perform t.expect_error(format($q$select public.registrar_pago(%L, null, 5, null, 'efectivo', null)$q$, (select id from orders where titulo='Limpieza')), '%no se paga a sí mismo%');
end $$;
select public.confirmar_pago(:'pago');
select public.registrar_pago(:'pedido', :'pau', 30000, null, 'efectivo', null) as pago_pau \gset
select set_config('t.pago_pau', :'pago_pau', false) \gset
do $$ begin
  assert (select estado from payments where id = current_setting('t.pago')::uuid) = 'confirmado';
  assert (select confirmado_por from payments where id = current_setting('t.pago')::uuid) = current_setting('request.jwt.claim.sub')::uuid;
  assert (select estado from payments where id = current_setting('t.pago_pau')::uuid) = 'confirmado', 'lo que carga quien cobra queda confirmado';
  assert public.dias_recordatorio() = 7;
end $$;
reset role;

-- alguien que no participa no puede figurar como pagador; el pagador puede borrar solo pendientes
select set_config('request.jwt.claim.sub', :'rita', false) \gset
set role authenticated;
do $$ begin
  perform t.expect_error(format($q$select public.eliminar_pago(%L)$q$, (select id from payments where estado='confirmado' and user_id=(select id from profiles where nombre='rita'))), '%No podés eliminar%');
end $$;
select public.registrar_pago(:'pedido', null, 100, null, 'efectivo', 'error de tipeo') as malo \gset
select public.eliminar_pago(:'malo');
do $$ begin assert (select count(*) from payments where monto = 100) = 0; end $$;
reset role;

-- saldado: quien cobra puede marcarlo al final; antes no
select set_config('request.jwt.claim.sub', :'pau', false) \gset
set role authenticated;
select public.cambiar_estado(:'pedido', 'comprado');
select public.cambiar_estado(:'pedido', 'entregado');
do $$ begin assert (select entregado_at from orders where titulo = 'Limpieza') is not null, 'se guarda la fecha real de entrega'; end $$;
reset role;
select set_config('request.jwt.claim.sub', :'rita', false) \gset
set role authenticated;
do $$ begin
  perform t.expect_error(format($q$select public.cambiar_estado(%L, 'saldado')$q$, (select id from orders where titulo='Limpieza')), '%organizador o un admin%');
end $$;
reset role;
select set_config('request.jwt.claim.sub', :'quique', false) \gset
set role authenticated;
select public.cambiar_estado(:'pedido', 'saldado');
do $$ begin
  assert (select estado from orders where titulo='Limpieza') = 'saldado';
  perform t.expect_error(format($q$select public.registrar_pago(%L, %L, 5, null, 'efectivo', null)$q$, (select id from orders where titulo='Limpieza'), (select id from profiles where nombre='rita')), '%ya está saldado%');
end $$;
reset role;
\echo 'OK: pagos'
