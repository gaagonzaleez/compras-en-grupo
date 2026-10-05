\set ON_ERROR_STOP on
\set QUIET on

select t.nuevo_usuario('mora', (select codigo_invitacion from group_settings)) as mora \gset
select t.nuevo_usuario('nico', (select codigo_invitacion from group_settings)) as nico \gset

-- mora organiza un pedido que se retira y se paga en otro lugar: nadie del grupo cobra
select set_config('request.jwt.claim.sub', :'mora', false) \gset
set role authenticated;
select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Bebidas', 'cobra_user_id', null, 'recibe_user_id', null, 'retiro_lugar', 'Mayorista Centro',
  'items', jsonb_build_array(jsonb_build_object('producto','Gaseosa','unidades_por_bulto',6,'precio_bulto',5000,'mis_bultos',2)))) as pedido \gset
select id as item from order_items where order_id = :'pedido' \gset
select set_config('t.p', :'pedido', false) \gset
do $$ begin
  assert (select cobra_user_id from orders where id = current_setting('t.p')::uuid) is null, 'sin cobrador';
end $$;
select public.cambiar_estado(:'pedido', 'cerrado');
select public.cambiar_estado(:'pedido', 'comprado');
select public.cambiar_estado(:'pedido', 'entregado');

-- no se cargan pagos en la app
do $$ begin
  perform t.expect_error(format($q$select public.registrar_pago(%L, null, 1000, null, 'efectivo', null)$q$, current_setting('t.p')), '%se paga en el momento%');
end $$;
reset role;

-- otro miembro (ni organizador, ni admin) NO puede marcarlo como saldado (null = uid no abre la puerta)
select set_config('request.jwt.claim.sub', :'nico', false) \gset
set role authenticated;
do $$ begin
  perform t.expect_error(format($q$select public.cambiar_estado(%L, 'saldado')$q$, current_setting('t.p')), '%Solo el organizador%');
end $$;
reset role;

-- el organizador sí
select set_config('request.jwt.claim.sub', :'mora', false) \gset
set role authenticated;
select public.cambiar_estado(:'pedido', 'saldado');
do $$ begin assert (select estado from orders where id = current_setting('t.p')::uuid) = 'saldado'; end $$;
reset role;
\echo 'OK: cobro externo'
