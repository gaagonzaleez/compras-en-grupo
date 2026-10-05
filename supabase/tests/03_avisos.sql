\set ON_ERROR_STOP on
\set QUIET on

select t.nuevo_usuario('uma', (select codigo_invitacion from group_settings)) as uma \gset
select t.nuevo_usuario('vero', (select codigo_invitacion from group_settings)) as vero \gset

-- el servidor (service_role) crea avisos para cualquiera
set role service_role;
insert into notificaciones (user_id, tipo, titulo) values (:'uma', 'pedido_nuevo', 'Pedido nuevo'), (:'vero', 'pedido_nuevo', 'Pedido nuevo');
reset role;

select set_config('request.jwt.claim.sub', :'uma', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from notificaciones) = 1, 'cada uno ve solo sus avisos';
  update notificaciones set leida = true;
  assert (select leida from notificaciones), 'puede marcar sus avisos como leídos';
  perform t.expect_error($q$update notificaciones set titulo = 'hack'$q$, '%permission denied%');
  perform t.expect_error($q$insert into notificaciones(user_id,tipo,titulo) values (auth.uid(),'pedido_nuevo','x')$q$, '%permission denied%');
  perform t.expect_error($q$select * from recordatorios$q$, '%permission denied%');
  -- suscripciones: solo propias
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/1', 'k', 'a');
  perform t.expect_error(format($q$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, 'https://push.example/2', 'k', 'a')$q$, (select id from profiles where nombre='vero')), '%row-level security%');
  assert (select count(*) from push_subscriptions) = 1;
  -- preferencias
  insert into notification_settings (user_id, desactivados) values (auth.uid(), '{pedido_nuevo}');
  update notification_settings set email_respaldo = false;
  assert (select desactivados from notification_settings) = '{pedido_nuevo}';
end $$;
reset role;

select set_config('request.jwt.claim.sub', :'vero', false) \gset
set role authenticated;
do $$ begin
  assert (select count(*) from push_subscriptions) = 0, 'no ve las suscripciones de otros';
  assert (select count(*) from notification_settings) = 0;
end $$;
reset role;

set role service_role;
do $$ begin assert (select count(*) from push_subscriptions) = 1; end $$;
insert into recordatorios (order_id, user_id, origen) select o.id, :'uma', 'manual' from orders o limit 1;
reset role;
\echo 'OK: avisos'
