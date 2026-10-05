\set ON_ERROR_STOP on
\set QUIET on

-- helpers de test ---------------------------------------------------------
create schema if not exists t;
grant usage on schema t to public;
create or replace function t.expect_error(p_sql text, p_like text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception 'Error inesperado. Esperaba "%" y fue "%"', p_like, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Tendría que haber fallado (%): %', p_like, p_sql;
end $$;
grant execute on function t.expect_error(text, text) to public;

create or replace function t.nuevo_usuario(p_nombre text, p_codigo text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v, p_nombre || '@x.test', jsonb_build_object(
    'nombre', p_nombre, 'apellido', 'Apellido', 'negocio', 'Kiosco ' || p_nombre,
    'direccion', 'Calle 123', 'email_contacto', p_nombre || '@x.test', 'invite_code', p_codigo));
  return v;
end $$;

-- 1. Registro e invitación ---------------------------------------------------
do $$ begin assert public.es_primer_usuario(), 'al inicio no hay usuarios'; end $$;

select t.nuevo_usuario('ana', '') as ana \gset
select t.nuevo_usuario('beto', (select codigo_invitacion from group_settings)) as beto \gset
select t.nuevo_usuario('carla', lower((select codigo_invitacion from group_settings))) as carla \gset

do $$ begin
  assert (select rol from profiles where nombre = 'ana') = 'admin', 'el primero es admin';
  assert (select rol from profiles where nombre = 'beto') = 'miembro', 'el segundo es miembro';
  assert not public.es_primer_usuario();
  assert public.codigo_invitacion_valido((select codigo_invitacion from group_settings));
  assert not public.codigo_invitacion_valido('MALO1234');
  perform t.expect_error($q$select t.nuevo_usuario('intruso', 'MALO1234')$q$, '%código de invitación%');
  perform t.expect_error($q$select t.nuevo_usuario('intruso', '')$q$, '%código de invitación%');
  perform t.expect_error($q$insert into auth.users(email, raw_user_meta_data) values ('z@x.test', '{"invite_code":"x"}')$q$, '%código de invitación%');
end $$;

-- el celular se guarda solo con dígitos y sin email real
insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), '1155551234@celular.test', jsonb_build_object(
    'nombre','dani','apellido','D','negocio','Almacén Dani','direccion','Av 1',
    'celular','+54 11 5555-1234','invite_code',(select codigo_invitacion from group_settings)));
do $$ begin
  assert (select celular from profiles where nombre = 'dani') = '541155551234';
  assert (select email from profiles where nombre = 'dani') is null;
end $$;
select id as dani from profiles where nombre = 'dani' \gset

-- 2. Permisos sobre perfiles --------------------------------------------------
select set_config('request.jwt.claim.sub', :'beto', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from profiles) = 4, 'un miembro ve a todos';
  assert (select count(*) from group_settings) = 0, 'un miembro no ve el código de invitación';
  perform t.expect_error(format($q$update profiles set rol = 'admin' where id = %L$q$, current_setting('request.jwt.claim.sub')), '%admin%');
  update profiles set negocio = 'Kiosco Beto SA' where id = current_setting('request.jwt.claim.sub')::uuid;
  assert (select negocio from profiles where id = current_setting('request.jwt.claim.sub')::uuid) = 'Kiosco Beto SA';
end $$;
-- no puede editar a otro (0 filas afectadas)
do $$ declare n int; begin
  update profiles set negocio = 'hack' where nombre = 'ana'; get diagnostics n = row_count;
  assert n = 0, 'no puede editar perfiles ajenos';
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'ana', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from group_settings) = 1, 'el admin ve el código';
  perform t.expect_error(format($q$update profiles set activo = false, rol = 'miembro' where id = %L$q$, current_setting('request.jwt.claim.sub')), '%al menos un admin%');
end $$;
reset role;

-- 3. Crear pedido (beto organiza) ----------------------------------------------
select set_config('request.jwt.claim.sub', :'beto', false) \gset
set role authenticated;

select public.guardar_pedido(null, jsonb_build_object(
  'titulo', 'Papel higiénico', 'proveedor', 'Distri SA', 'fecha_entrega', '2026-12-01',
  'cobra_user_id', :'ana', 'recibe_user_id', :'beto',
  'items', jsonb_build_array(jsonb_build_object(
      'producto', 'Papel x48', 'precio_unitario', 1200, 'unidades_por_bulto', 48,
      'precio_bulto', 57600, 'bultos_total', 100, 'mis_bultos', 20)),
  'extras', jsonb_build_array(jsonb_build_object('concepto', 'Flete', 'monto', 50000, 'modo', 'iguales'))
)) as pedido \gset

do $$ begin
  assert (select count(*) from orders) = 1;
  assert (select estado from orders) = 'abierto';
  assert (select organizador_id from orders) = current_setting('request.jwt.claim.sub')::uuid;
  assert (select bultos from allocations) = 20, 'el organizador se anotó 20 bultos';
  assert (select monto from extra_costs) = 50000;
  -- no se puede crear un pedido a nombre de otro ni cambiar el estado a mano
  perform t.expect_error(format($q$insert into orders(titulo,organizador_id,cobra_user_id,recibe_user_id) values ('x', %L, %L, %L)$q$,
    (select id from profiles where nombre='ana'), (select id from profiles where nombre='ana'), (select id from profiles where nombre='ana')), '%row-level security%');
  perform t.expect_error(format($q$update orders set estado = 'comprado' where id = %L$q$, (select id from orders)), '%cambiar_estado%');
  -- dinero siempre entero y sin negativos
  perform t.expect_error(format($q$select public.guardar_pedido(null, '{"titulo":"x","cobra_user_id":"%1$s","recibe_user_id":"%1$s","items":[{"producto":"a","unidades_por_bulto":1,"precio_bulto":-5}]}')$q$, current_setting('request.jwt.claim.sub')), '%check%');
  perform t.expect_error(format($q$select public.guardar_pedido(null, '{"titulo":"x","cobra_user_id":"%1$s","recibe_user_id":"%1$s","items":[{"producto":"a","unidades_por_bulto":1,"precio_bulto":10.5}]}')$q$, current_setting('request.jwt.claim.sub')), '%bigint%');
end $$;
select id as item from order_items limit 1 \gset
reset role;

-- 4. Otros miembros se anotan ---------------------------------------------------
select set_config('request.jwt.claim.sub', :'carla', false) \gset
set role authenticated;
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 15)));
do $$ begin
  assert (select bultos from allocations where user_id = current_setting('request.jwt.claim.sub')::uuid) = 15;
  -- no puede cargarle cantidades a otro
  perform t.expect_error(format($q$select public.guardar_cantidades(%L, %L, '[]'::jsonb)$q$, (select id from orders), (select id from profiles where nombre='beto')), '%organizador%');
  -- ni editar el pedido
  perform t.expect_error(format($q$select public.guardar_pedido(%L, '{"titulo":"hack","cobra_user_id":"%2$s","recibe_user_id":"%2$s","items":[{"producto":"a","unidades_por_bulto":1,"precio_bulto":1}]}')$q$, (select id from orders), current_setting('request.jwt.claim.sub')), '%No podés editar%');
  perform t.expect_error(format($q$select public.cambiar_estado(%L, 'cerrado')$q$, (select id from orders)), '%organizador o un admin%');
end $$;
-- con cantidad 0 se quita la fila
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 0)));
do $$ begin assert (select count(*) from allocations where user_id = current_setting('request.jwt.claim.sub')::uuid) = 0; end $$;
select public.guardar_cantidades(:'pedido', null, jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 15)));
reset role;

-- el organizador carga las cantidades de dani
select set_config('request.jwt.claim.sub', :'beto', false) \gset
set role authenticated;
select public.guardar_cantidades(:'pedido', :'dani', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 70)));
do $$ begin
  -- 20 + 15 + 70 = 105 > 100 disponibles: no se puede cerrar
  perform t.expect_error(format($q$select public.cambiar_estado(%L, 'cerrado')$q$, (select id from orders)), '%más bultos de los disponibles%');
end $$;
select public.guardar_cantidades(:'pedido', :'dani', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 65)));

-- 5. Estados -------------------------------------------------------------------
select public.cambiar_estado(:'pedido', 'cerrado');
do $$ begin
  assert (select estado from orders) = 'cerrado';
  -- cerrado: ya nadie cambia cantidades ni datos (salvo reabrir)
  perform t.expect_error(format($q$select public.guardar_cantidades(%L, null, '[]'::jsonb)$q$, (select id from orders)), '%ya no está abierto%');
  perform t.expect_error(format($q$select public.cambiar_estado(%L, 'entregado')$q$, (select id from orders)), '%No se puede pasar%');
end $$;
-- el flete llega después de cerrar: el organizador todavía puede cargar extras
select public.guardar_extras(:'pedido', jsonb_build_array(
  jsonb_build_object('concepto', 'Flete', 'monto', 50000, 'modo', 'iguales'),
  jsonb_build_object('concepto', 'Comisión', 'monto', 1000, 'modo', 'manual',
     'manual', jsonb_build_array(
        jsonb_build_object('user_id', :'beto', 'monto', 400),
        jsonb_build_object('user_id', :'carla', 'monto', 600)))));
do $$ begin
  assert (select count(*) from extra_costs) = 2;
  assert (select sum(monto) from extra_cost_shares) = 1000;
  perform t.expect_error(format($q$select public.guardar_extras(%L, '[{"concepto":"x","monto":10,"modo":"manual","manual":[{"user_id":"%s","monto":3}]}]'::jsonb)$q$,
    (select id from orders), current_setting('request.jwt.claim.sub')), '%tienen que coincidir%');
end $$;
select public.cambiar_estado(:'pedido', 'abierto');   -- reabrir
select public.guardar_cantidades(:'pedido', :'dani', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 60)));
select public.cambiar_estado(:'pedido', 'cerrado');
select public.cambiar_estado(:'pedido', 'comprado');
select public.cambiar_estado(:'pedido', 'entregado');
do $$ begin
  assert (select estado from orders) = 'entregado';
  perform t.expect_error(format($q$select public.guardar_extras(%L, '[]'::jsonb)$q$, (select id from orders)), '%No podés cambiar los costos extra%');
end $$;
reset role;

-- 6. Admin puede todo; baja de miembros ---------------------------------------
select set_config('request.jwt.claim.sub', :'ana', false) \gset
set role authenticated;
select public.guardar_cantidades(:'pedido', :'carla', jsonb_build_array(jsonb_build_object('item_id', :'item', 'bultos', 10)));
select public.cambiar_estado(:'pedido', 'saldado');
update profiles set activo = false where nombre = 'carla';
reset role;

select set_config('request.jwt.claim.sub', :'carla', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from orders) = 0, 'un miembro dado de baja no ve nada';
  assert (select count(*) from profiles) = 1, 'solo ve su propio perfil (para mostrarle el aviso de baja)';
  perform t.expect_error(format($q$select public.guardar_cantidades(%L, null, '[]'::jsonb)$q$, (select id from orders)), '%');
end $$;
reset role;

-- 7. Anónimos no acceden a nada ---------------------------------------------------
set role anon;
do $$ begin
  perform t.expect_error($q$select * from orders$q$, '%permission denied%');
  perform t.expect_error($q$select * from profiles$q$, '%permission denied%');
  assert public.es_primer_usuario() = false;
end $$;
reset role;

\echo 'OK: todas las pruebas de base de datos pasaron'
