-- Compras en grupo: esquema inicial (etapas 1 a 3).
-- Todo el dinero se guarda como pesos ENTEROS (bigint). Nunca decimales.

-- ───────────────────────── Tipos ─────────────────────────
create type public.rol_usuario    as enum ('miembro', 'admin');
create type public.estado_pedido  as enum ('abierto', 'cerrado', 'comprado', 'entregado', 'saldado');
create type public.reparto_pedido as enum ('por_cantidad', 'partes_iguales');
create type public.reparto_extra  as enum ('iguales', 'proporcional', 'manual');

-- ───────────────────────── Tablas ─────────────────────────
create table public.group_settings (
  id                smallint primary key default 1 check (id = 1),   -- una sola fila: un solo grupo
  codigo_invitacion text not null,
  dias_recordatorio int not null default 7 check (dias_recordatorio >= 0)
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) > 0),
  apellido   text not null check (length(trim(apellido)) > 0),
  negocio    text not null check (length(trim(negocio)) > 0),   -- nombre de fantasía: es como se muestra a cada usuario
  direccion  text not null check (length(trim(direccion)) > 0),
  email      text,                                               -- email real de contacto (puede ser null si entra con celular)
  celular    text,                                               -- normalizado: solo dígitos
  rol        public.rol_usuario not null default 'miembro',
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint contacto_requerido check (email is not null or celular is not null)
);
create unique index profiles_email_uniq   on public.profiles (lower(email))  where email is not null;
create unique index profiles_celular_uniq on public.profiles (celular)       where celular is not null;

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (length(trim(titulo)) > 0),
  proveedor      text,
  fecha          date not null default current_date,
  fecha_entrega  date,
  notas          text,
  organizador_id uuid not null references public.profiles (id),
  cobra_user_id  uuid not null references public.profiles (id),   -- quién recibe el dinero
  recibe_user_id uuid not null references public.profiles (id),   -- quién recibe la mercadería
  estado         public.estado_pedido not null default 'abierto',
  modo_reparto   public.reparto_pedido not null default 'por_cantidad',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_estado_idx on public.orders (estado, created_at desc);
create index orders_organizador_idx on public.orders (organizador_id);

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  orden              int not null default 0,
  producto           text not null check (length(trim(producto)) > 0),
  precio_unitario    bigint check (precio_unitario >= 0),            -- informativo: lo que se cobra es precio_bulto
  unidades_por_bulto int not null check (unidades_por_bulto > 0),
  precio_bulto       bigint not null check (precio_bulto >= 0),
  bultos_total       int check (bultos_total >= 0)                    -- opcional: tope de bultos disponibles
);
create index order_items_order_idx on public.order_items (order_id);

create table public.allocations (
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  user_id       uuid not null references public.profiles (id),
  bultos        int not null check (bultos > 0),                     -- 0 = no hay fila
  updated_at    timestamptz not null default now(),
  primary key (order_item_id, user_id)
);
create index allocations_user_idx on public.allocations (user_id);

create table public.extra_costs (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  concepto text not null check (length(trim(concepto)) > 0),
  monto    bigint not null check (monto > 0),
  modo     public.reparto_extra not null default 'iguales'
);
create index extra_costs_order_idx on public.extra_costs (order_id);

-- Montos fijos por persona (solo se usa en modo "manual").
create table public.extra_cost_shares (
  extra_cost_id uuid not null references public.extra_costs (id) on delete cascade,
  user_id       uuid not null references public.profiles (id),
  monto         bigint not null check (monto >= 0),
  primary key (extra_cost_id, user_id)
);

-- Una sola fila con el código de invitación (valor aleatorio).
insert into public.group_settings (id, codigo_invitacion)
values (1, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

-- ───────────────────────── Helpers (security definer) ─────────────────────────
create function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo);
$$;

create function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo and rol = 'admin');
$$;

create function public.estado_de_pedido(p_order uuid) returns public.estado_pedido
language sql stable security definer set search_path = public as $$
  select estado from public.orders where id = p_order;
$$;

create function public.organizador_de_pedido(p_order uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organizador_id from public.orders where id = p_order;
$$;

create function public.pedido_de_item(p_item uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select order_id from public.order_items where id = p_item;
$$;

-- Funciones públicas para la pantalla de registro (sin sesión).
create function public.es_primer_usuario() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles);
$$;

create function public.codigo_invitacion_valido(p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles)
      or exists (
        select 1 from public.group_settings
        where id = 1 and upper(trim(coalesce(p_codigo, ''))) = upper(codigo_invitacion)
      );
$$;

-- ───────────────────────── Alta de usuarios ─────────────────────────
-- Se ejecuta al crearse un usuario en auth.users: valida el código de invitación
-- (acá, en la base, para que no se pueda saltear desde el cliente) y crea el perfil.
-- El primer usuario del grupo queda como admin y no necesita código.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  es_primero  boolean;
  v_email     text  := nullif(lower(trim(coalesce(meta->>'email_contacto', ''))), '');
  v_celular   text  := nullif(regexp_replace(coalesce(meta->>'celular', ''), '\D', '', 'g'), '');
begin
  perform pg_advisory_xact_lock(7001);   -- evita que dos "primeros" se registren a la vez
  es_primero := not exists (select 1 from public.profiles);

  if not es_primero and not public.codigo_invitacion_valido(meta->>'invite_code') then
    raise exception 'El código de invitación no es válido.';
  end if;

  insert into public.profiles (id, nombre, apellido, negocio, direccion, email, celular, rol)
  values (
    new.id,
    trim(coalesce(meta->>'nombre', '')),
    trim(coalesce(meta->>'apellido', '')),
    trim(coalesce(meta->>'negocio', '')),
    trim(coalesce(meta->>'direccion', '')),
    v_email,
    v_celular,
    case when es_primero then 'admin'::public.rol_usuario else 'miembro'::public.rol_usuario end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Los usuarios comunes no pueden cambiarse el rol ni reactivarse; nunca se queda el grupo sin admin.
create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.rol is distinct from old.rol or new.activo is distinct from old.activo) and not public.es_admin() then
    raise exception 'Solo un admin puede cambiar el rol o dar de baja a un miembro.';
  end if;
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.profiles where id <> old.id and rol = 'admin' and activo) then
    raise exception 'Tiene que quedar al menos un admin activo.';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ───────────────────────── Triggers de pedidos ─────────────────────────
create function public.orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.estado is distinct from old.estado
     and coalesce(current_setting('app.cambio_estado', true), '') <> '1' then
    raise exception 'El estado del pedido solo se cambia con cambiar_estado().';
  end if;
  if new.organizador_id is distinct from old.organizador_id and not public.es_admin() then
    raise exception 'Solo un admin puede cambiar el organizador del pedido.';
  end if;
  return new;
end;
$$;
create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

create function public.touch_allocation() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
create trigger allocations_touch before update on public.allocations
  for each row execute function public.touch_allocation();

-- ───────────────────────── RLS ─────────────────────────
alter table public.group_settings    enable row level security;
alter table public.profiles          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.allocations       enable row level security;
alter table public.extra_costs       enable row level security;
alter table public.extra_cost_shares enable row level security;

-- group_settings: solo admin (incluye el código de invitación)
create policy group_settings_select on public.group_settings for select using (public.es_admin());
create policy group_settings_update on public.group_settings for update using (public.es_admin()) with check (public.es_admin());

-- profiles: los miembros activos se ven entre sí; cada uno edita lo suyo; el admin edita a todos.
-- (cada uno puede leer su propia fila aunque esté dado de baja, para poder avisarle)
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.es_miembro());
create policy profiles_update on public.profiles for update
  using (public.es_miembro() and (id = auth.uid() or public.es_admin()))
  with check (public.es_miembro() and (id = auth.uid() or public.es_admin()));

-- orders
create policy orders_select on public.orders for select using (public.es_miembro());
create policy orders_insert on public.orders for insert
  with check (public.es_miembro() and organizador_id = auth.uid());
create policy orders_update on public.orders for update
  using (public.es_miembro() and (public.es_admin() or (organizador_id = auth.uid() and estado = 'abierto')))
  with check (public.es_miembro() and (public.es_admin() or organizador_id = auth.uid()));
create policy orders_delete on public.orders for delete
  using (public.es_miembro() and (public.es_admin() or (organizador_id = auth.uid() and estado = 'abierto')));

-- order_items: organizador mientras esté abierto; admin siempre
create policy order_items_select on public.order_items for select using (public.es_miembro());
create policy order_items_write on public.order_items for all
  using (public.es_miembro() and (public.es_admin()
         or (public.organizador_de_pedido(order_id) = auth.uid() and public.estado_de_pedido(order_id) = 'abierto')))
  with check (public.es_miembro() and (public.es_admin()
         or (public.organizador_de_pedido(order_id) = auth.uid() and public.estado_de_pedido(order_id) = 'abierto')));

-- allocations: cada uno lo suyo; organizador y admin las de cualquiera; solo con el pedido abierto (admin siempre)
create policy allocations_select on public.allocations for select using (public.es_miembro());
create policy allocations_write on public.allocations for all
  using (
    public.es_miembro() and (
      public.es_admin() or (
        public.estado_de_pedido(public.pedido_de_item(order_item_id)) = 'abierto'
        and (user_id = auth.uid()
             or public.organizador_de_pedido(public.pedido_de_item(order_item_id)) = auth.uid())
      )
    )
  )
  with check (
    public.es_miembro() and (
      public.es_admin() or (
        public.estado_de_pedido(public.pedido_de_item(order_item_id)) = 'abierto'
        and (user_id = auth.uid()
             or public.organizador_de_pedido(public.pedido_de_item(order_item_id)) = auth.uid())
      )
    )
  );

-- extras: el organizador los puede tocar hasta que se compra (el flete suele llegar después de cerrar)
create policy extra_costs_select on public.extra_costs for select using (public.es_miembro());
create policy extra_costs_write on public.extra_costs for all
  using (public.es_miembro() and (public.es_admin()
         or (public.organizador_de_pedido(order_id) = auth.uid()
             and public.estado_de_pedido(order_id) in ('abierto', 'cerrado', 'comprado'))))
  with check (public.es_miembro() and (public.es_admin()
         or (public.organizador_de_pedido(order_id) = auth.uid()
             and public.estado_de_pedido(order_id) in ('abierto', 'cerrado', 'comprado'))));

create policy extra_cost_shares_select on public.extra_cost_shares for select using (public.es_miembro());
create policy extra_cost_shares_write on public.extra_cost_shares for all
  using (public.es_miembro() and (public.es_admin() or exists (
    select 1 from public.extra_costs x
    where x.id = extra_cost_id
      and public.organizador_de_pedido(x.order_id) = auth.uid()
      and public.estado_de_pedido(x.order_id) in ('abierto', 'cerrado', 'comprado'))))
  with check (public.es_miembro() and (public.es_admin() or exists (
    select 1 from public.extra_costs x
    where x.id = extra_cost_id
      and public.organizador_de_pedido(x.order_id) = auth.uid()
      and public.estado_de_pedido(x.order_id) in ('abierto', 'cerrado', 'comprado'))));

-- ───────────────────────── Funciones de negocio ─────────────────────────
-- Reemplaza los costos extra de un pedido (alta, edición y baja) dentro de una transacción.
create function public._sincronizar_extras(p_order_id uuid, p_extras jsonb) returns void
language plpgsql set search_path = public as $$
declare
  e      jsonb;
  m      jsonb;
  v_id   uuid;
  v_keep uuid[] := '{}';
  v_monto bigint;
  v_modo  public.reparto_extra;
  v_suma  bigint;
begin
  for e in select * from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) loop
    v_id    := nullif(e->>'id', '')::uuid;
    v_monto := (e->>'monto')::bigint;
    v_modo  := coalesce(nullif(e->>'modo', ''), 'iguales')::public.reparto_extra;

    if v_id is null then
      insert into public.extra_costs (order_id, concepto, monto, modo)
      values (p_order_id, trim(e->>'concepto'), v_monto, v_modo)
      returning id into v_id;
    else
      update public.extra_costs
         set concepto = trim(e->>'concepto'), monto = v_monto, modo = v_modo
       where id = v_id and order_id = p_order_id;
      if not found then raise exception 'Uno de los costos extra no existe o no se puede editar.'; end if;
    end if;
    v_keep := v_keep || v_id;

    delete from public.extra_cost_shares where extra_cost_id = v_id;
    if v_modo = 'manual' then
      for m in select * from jsonb_array_elements(coalesce(e->'manual', '[]'::jsonb)) loop
        insert into public.extra_cost_shares (extra_cost_id, user_id, monto)
        values (v_id, (m->>'user_id')::uuid, (m->>'monto')::bigint);
      end loop;
      select coalesce(sum(monto), 0) into v_suma from public.extra_cost_shares where extra_cost_id = v_id;
      if v_suma <> v_monto then
        raise exception 'En "%" los montos manuales suman % y el costo extra es %: tienen que coincidir.',
          trim(e->>'concepto'), v_suma, v_monto;
      end if;
    end if;
  end loop;

  delete from public.extra_costs where order_id = p_order_id and not (id = any (v_keep));
end;
$$;

-- Crea (p_order_id null) o edita un pedido completo: datos, productos y costos extra.
-- Al crear, el organizador puede anotar sus propios bultos con "mis_bultos" en cada producto.
create function public.guardar_pedido(p_order_id uuid, p_data jsonb) returns uuid
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
                               cobra_user_id, recibe_user_id, modo_reparto)
    values (
      trim(p_data->>'titulo'),
      nullif(trim(coalesce(p_data->>'proveedor', '')), ''),
      coalesce(nullif(p_data->>'fecha', '')::date, current_date),
      nullif(p_data->>'fecha_entrega', '')::date,
      nullif(trim(coalesce(p_data->>'notas', '')), ''),
      auth.uid(),
      (p_data->>'cobra_user_id')::uuid,
      (p_data->>'recibe_user_id')::uuid,
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
      recibe_user_id = (p_data->>'recibe_user_id')::uuid,
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

-- Edita solo los costos extra (el flete suele llegar con el pedido ya cerrado o comprado).
create function public.guardar_extras(p_order_id uuid, p_extras jsonb) returns void
language plpgsql set search_path = public as $$
begin
  if not public.es_miembro() then raise exception 'No tenés permiso para esto.'; end if;
  if not (public.es_admin() or (
        public.organizador_de_pedido(p_order_id) = auth.uid()
        and public.estado_de_pedido(p_order_id) in ('abierto', 'cerrado', 'comprado'))) then
    raise exception 'No podés cambiar los costos extra de este pedido.';
  end if;
  perform public._sincronizar_extras(p_order_id, p_extras);
end;
$$;

-- Anota (o corrige) cuántos bultos de cada producto se lleva una persona. 0 = quitar.
create function public.guardar_cantidades(p_order_id uuid, p_user_id uuid, p_bultos jsonb) returns void
language plpgsql set search_path = public as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  r      record;
begin
  if not public.es_miembro() then raise exception 'No tenés permiso para esto.'; end if;
  if public.estado_de_pedido(p_order_id) is null then raise exception 'El pedido no existe.'; end if;
  if not public.es_admin() then
    if public.estado_de_pedido(p_order_id) <> 'abierto' then
      raise exception 'El pedido ya no está abierto: pedile al organizador que lo reabra.';
    end if;
    if v_user <> auth.uid() and public.organizador_de_pedido(p_order_id) <> auth.uid() then
      raise exception 'Solo el organizador puede cargar cantidades de otra persona.';
    end if;
  end if;
  if not exists (select 1 from public.profiles where id = v_user and activo) then
    raise exception 'Ese miembro no está activo.';
  end if;

  for r in select * from jsonb_to_recordset(coalesce(p_bultos, '[]'::jsonb)) as x(item_id uuid, bultos int) loop
    if r.bultos is null or r.bultos < 0 then raise exception 'La cantidad de bultos no puede ser negativa.'; end if;
    if not exists (select 1 from public.order_items where id = r.item_id and order_id = p_order_id) then
      raise exception 'Uno de los productos no pertenece a este pedido.';
    end if;
    if r.bultos > 0 then
      insert into public.allocations (order_item_id, user_id, bultos) values (r.item_id, v_user, r.bultos)
      on conflict (order_item_id, user_id) do update set bultos = excluded.bultos;
    else
      delete from public.allocations where order_item_id = r.item_id and user_id = v_user;
    end if;
  end loop;
end;
$$;

-- Avanza el estado del pedido. Es el único camino para cambiar `estado`.
--   abierto → cerrado → comprado → entregado → saldado    (y cerrado → abierto para reabrir)
create function public.cambiar_estado(p_order_id uuid, p_nuevo public.estado_pedido) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  v_ok boolean;
  v_pasados text;
  v_mal text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if not public.es_miembro() or not (public.es_admin() or o.organizador_id = auth.uid()) then
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
  update public.orders set estado = p_nuevo where id = p_order_id;
  perform set_config('app.cambio_estado', '', true);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select, update on public.group_settings to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.orders, public.order_items, public.allocations,
      public.extra_costs, public.extra_cost_shares to authenticated;

grant execute on function public.es_miembro(), public.es_admin(),
  public.estado_de_pedido(uuid), public.organizador_de_pedido(uuid), public.pedido_de_item(uuid)
  to authenticated;
grant execute on function public._sincronizar_extras(uuid, jsonb) to authenticated;
grant execute on function public.guardar_pedido(uuid, jsonb), public.guardar_extras(uuid, jsonb),
  public.guardar_cantidades(uuid, uuid, jsonb), public.cambiar_estado(uuid, public.estado_pedido)
  to authenticated;
-- La pantalla de registro llama a estas dos sin sesión.
grant execute on function public.es_primer_usuario(), public.codigo_invitacion_valido(text) to anon, authenticated;
