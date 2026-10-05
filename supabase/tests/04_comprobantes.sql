\set ON_ERROR_STOP on
\set QUIET on

select t.nuevo_usuario('gus', (select codigo_invitacion from group_settings)) as gus \gset
select t.nuevo_usuario('hilda', (select codigo_invitacion from group_settings)) as hilda \gset
select t.nuevo_usuario('ines', (select codigo_invitacion from group_settings)) as ines \gset

select set_config('request.jwt.claim.sub', :'gus', false) \gset
set role authenticated;
select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Gaseosas', 'cobra_user_id', :'gus', 'recibe_user_id', :'gus',
  'items', jsonb_build_array(jsonb_build_object('producto','Cola','unidades_por_bulto',6,'precio_bulto',5000,'mis_bultos',1)))) as pedido \gset
select id as item from order_items where order_id = :'pedido' \gset
reset role;

-- hilda compra; ines no participa
select set_config('request.jwt.claim.sub', :'hilda', false) \gset
set role authenticated;
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 2)));
insert into attachments (order_id, path, nombre, mime, bytes, subido_por)
values (:'pedido', :'pedido' || '/a.jpg', 'factura.jpg', 'image/jpeg', 12345, :'hilda');
do $$ begin
  assert (select count(*) from attachments) = 1;
  -- no se puede subir a nombre de otro, ni tipos raros, ni archivos gigantes
  perform t.expect_error(format($q$insert into attachments (order_id, path, nombre, mime, bytes, subido_por) values (%L, 'x1', 'a', 'image/jpeg', 10, %L)$q$, (select id from orders where titulo='Gaseosas'), (select id from profiles where nombre='gus')), '%row-level security%');
  perform t.expect_error(format($q$insert into attachments (order_id, path, nombre, mime, bytes, subido_por) values (%L, 'x2', 'a', 'application/x-msdownload', 10, auth.uid())$q$, (select id from orders where titulo='Gaseosas')), '%check%');
  perform t.expect_error(format($q$insert into attachments (order_id, path, nombre, mime, bytes, subido_por) values (%L, 'x3', 'a', 'image/png', 99999999, auth.uid())$q$, (select id from orders where titulo='Gaseosas')), '%check%');
  insert into storage.objects (bucket_id, name) values ('comprobantes', 'algo/a.jpg');
  perform t.expect_error($q$insert into storage.objects (bucket_id, name) values ('otro-bucket', 'x')$q$, '%violates%');
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'ines', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from attachments) = 1, 'todos los miembros ven los comprobantes';
  perform t.expect_error(format($q$insert into attachments (order_id, path, nombre, mime, bytes, subido_por) values (%L, 'x4', 'a', 'image/png', 10, auth.uid())$q$, (select id from orders where titulo='Gaseosas')), '%row-level security%');
end $$;
delete from attachments;          -- ines no puede borrar lo ajeno (0 filas)
do $$ begin assert (select count(*) from attachments) = 1; end $$;
reset role;

-- el organizador sí puede borrar lo de otro
select set_config('request.jwt.claim.sub', :'gus', false) \gset
set role authenticated;
delete from attachments;
do $$ begin assert (select count(*) from attachments) = 0; end $$;
reset role;
\echo 'OK: comprobantes'
