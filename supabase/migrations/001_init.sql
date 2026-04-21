-- =========================================================
--  БАРБЕРШОП "ДРУЗЬЯ" — БД (без бонусов, чистая запись)
-- =========================================================

create extension if not exists "uuid-ossp";

-- =========================================================
--  ПОЛЬЗОВАТЕЛИ
-- =========================================================
create table if not exists public.users (
  id              uuid primary key default uuid_generate_v4(),
  telegram_id     bigint unique not null,
  first_name      text,
  last_name       text,
  username        text,
  phone           text,
  photo_url       text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_users_tg on public.users(telegram_id);

-- =========================================================
--  МАСТЕРА
-- =========================================================
create table if not exists public.masters (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  photo_url       text,
  specialization  text,
  bio             text,
  rating          numeric(2,1) default 5.0,
  schedule        jsonb not null default '{"type":"5/2","start_time":"10:00","end_time":"22:00","anchor_date":"2026-01-01"}'::jsonb,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- =========================================================
--  УСЛУГИ
-- =========================================================
create table if not exists public.services (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  category        text not null,
  price           integer not null,
  duration_min    integer not null,
  description     text,
  is_active       boolean not null default true,
  is_popular      boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_svc_cat on public.services(category);

-- =========================================================
--  СВЯЗЬ МАСТЕР ↔ УСЛУГА
-- =========================================================
create table if not exists public.master_services (
  master_id       uuid not null references public.masters(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  primary key (master_id, service_id)
);

-- =========================================================
--  ЗАПИСИ
-- =========================================================
create table if not exists public.bookings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  master_id       uuid not null references public.masters(id),
  service_ids     uuid[] not null,
  booking_date    date not null,
  booking_time    time not null,
  duration_min    integer not null,
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','completed','cancelled','no_show')),
  total_price     integer not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bk_master on public.bookings(master_id);
create index if not exists idx_bk_date on public.bookings(booking_date);

-- =========================================================
--  АДМИНЫ
-- =========================================================
create table if not exists public.admins (
  id              uuid primary key default uuid_generate_v4(),
  telegram_id     bigint unique not null,
  name            text,
  role            text not null default 'admin',
  created_at      timestamptz not null default now()
);

-- =========================================================
--  ТРИГГЕР: updated_at
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_bookings_upd before update on public.bookings
  for each row execute function public.set_updated_at();

-- =========================================================
--  RLS
-- =========================================================
alter table public.users enable row level security;
alter table public.masters enable row level security;
alter table public.services enable row level security;
alter table public.master_services enable row level security;
alter table public.bookings enable row level security;
alter table public.admins enable row level security;

create policy masters_read on public.masters for select using (true);
create policy services_read on public.services for select using (true);
create policy ms_read on public.master_services for select using (true);
create policy bookings_read on public.bookings for select using (true);
create policy bookings_insert on public.bookings for insert with check (true);

-- =========================================================
--  RPC: ПОЛУЧИТЬ/СОЗДАТЬ ПОЛЬЗОВАТЕЛЯ
-- =========================================================
create or replace function public.get_or_create_user(
  p_telegram_id bigint, p_first_name text default null,
  p_last_name text default null, p_username text default null,
  p_photo_url text default null
)
returns public.users language plpgsql security definer set search_path = public as $$
declare u public.users;
begin
  select * into u from public.users where telegram_id = p_telegram_id;
  if found then
    update public.users set
      first_name = coalesce(p_first_name, first_name),
      last_name = coalesce(p_last_name, last_name),
      username = coalesce(p_username, username),
      photo_url = coalesce(p_photo_url, photo_url)
    where id = u.id returning * into u;
    return u;
  end if;
  insert into public.users (telegram_id, first_name, last_name, username, photo_url)
  values (p_telegram_id, p_first_name, p_last_name, p_username, p_photo_url)
  returning * into u;
  return u;
end; $$;
grant execute on function public.get_or_create_user(bigint,text,text,text,text) to anon, authenticated;

-- =========================================================
--  RPC: МОИ ЗАПИСИ
-- =========================================================
create or replace function public.get_my_bookings(p_telegram_id bigint)
returns setof public.bookings language sql security definer set search_path = public as $$
  select b.* from public.bookings b
  join public.users u on u.id = b.user_id
  where u.telegram_id = p_telegram_id
  order by b.booking_date desc, b.booking_time desc;
$$;
grant execute on function public.get_my_bookings(bigint) to anon, authenticated;

-- =========================================================
--  RPC: ОТМЕНА ЗАПИСИ
-- =========================================================
create or replace function public.cancel_my_booking(p_telegram_id bigint, p_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.users where telegram_id = p_telegram_id;
  if v_user_id is null then return false; end if;
  update public.bookings set status = 'cancelled'
  where id = p_booking_id and user_id = v_user_id and status in ('pending','confirmed');
  return found;
end; $$;
grant execute on function public.cancel_my_booking(bigint,uuid) to anon, authenticated;

-- =========================================================
--  RPC: ПРОВЕРКА АДМИНА
-- =========================================================
create or replace function public.check_admin(p_telegram_id bigint)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.admins where telegram_id = p_telegram_id);
$$;
grant execute on function public.check_admin(bigint) to anon, authenticated;

-- =========================================================
--  ADMIN RPC: ВСЕ ЗАПИСИ
-- =========================================================
create or replace function public.admin_get_bookings(p_admin_tg_id bigint)
returns table (
  id uuid, user_id uuid, master_id uuid, service_ids uuid[],
  booking_date date, booking_time time, duration_min int,
  status text, total_price int, notes text, created_at timestamptz,
  client_name text, client_phone text, client_username text, master_name text
) language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where telegram_id = p_admin_tg_id) then
    raise exception 'Access denied'; end if;
  return query
    select b.id, b.user_id, b.master_id, b.service_ids,
           b.booking_date, b.booking_time, b.duration_min,
           b.status, b.total_price, b.notes, b.created_at,
           coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,''),
           u.phone, u.username, m.name
    from public.bookings b
    left join public.users u on u.id = b.user_id
    left join public.masters m on m.id = b.master_id
    order by b.booking_date desc, b.booking_time desc;
end; $$;
grant execute on function public.admin_get_bookings(bigint) to anon, authenticated;

-- =========================================================
--  ADMIN RPC: СОЗДАТЬ ЗАПИСЬ (walk-in)
-- =========================================================
create or replace function public.admin_create_booking(
  p_admin_tg_id bigint, p_client_name text, p_client_phone text,
  p_master_id uuid, p_service_ids uuid[], p_booking_date date,
  p_booking_time time, p_duration_min int, p_total_price int, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_id uuid;
begin
  if not exists(select 1 from public.admins where telegram_id = p_admin_tg_id) then
    raise exception 'Access denied'; end if;
  if p_client_phone is not null and p_client_phone != '' then
    select id into v_user_id from public.users where phone = p_client_phone limit 1;
  end if;
  if v_user_id is null then
    insert into public.users (telegram_id, first_name, phone)
    values (-floor(random()*900000000+100000000)::bigint, p_client_name, p_client_phone)
    returning id into v_user_id;
  end if;
  insert into public.bookings (user_id, master_id, service_ids, booking_date, booking_time,
    duration_min, status, total_price, notes)
  values (v_user_id, p_master_id, p_service_ids, p_booking_date, p_booking_time,
    p_duration_min, 'confirmed', p_total_price, p_notes)
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.admin_create_booking(bigint,text,text,uuid,uuid[],date,time,int,int,text) to anon, authenticated;

-- =========================================================
--  ADMIN RPC: ОБНОВИТЬ СТАТУС
-- =========================================================
create or replace function public.admin_update_booking_status(
  p_admin_tg_id bigint, p_booking_id uuid, p_status text
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where telegram_id = p_admin_tg_id) then
    raise exception 'Access denied'; end if;
  update public.bookings set status = p_status where id = p_booking_id;
  return true;
end; $$;
grant execute on function public.admin_update_booking_status(bigint,uuid,text) to anon, authenticated;

-- =========================================================
--  ADMIN RPC: UPSERT МАСТЕРА
-- =========================================================
create or replace function public.admin_upsert_master(
  p_admin_tg_id bigint, p_master_id uuid default null,
  p_name text default null, p_specialization text default null,
  p_bio text default null, p_photo_url text default null,
  p_schedule jsonb default null, p_is_active boolean default true, p_sort_order int default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.admins where telegram_id = p_admin_tg_id) then
    raise exception 'Access denied'; end if;
  if p_master_id is not null then
    update public.masters set name=coalesce(p_name,name), specialization=coalesce(p_specialization,specialization),
      bio=coalesce(p_bio,bio), photo_url=coalesce(p_photo_url,photo_url), schedule=coalesce(p_schedule,schedule),
      is_active=p_is_active, sort_order=p_sort_order where id=p_master_id returning id into v_id;
  else
    insert into public.masters (name,specialization,bio,photo_url,schedule,is_active,sort_order)
    values (p_name,p_specialization,p_bio,p_photo_url,
      coalesce(p_schedule,'{"type":"5/2","start_time":"10:00","end_time":"22:00","anchor_date":"2026-01-01"}'::jsonb),
      p_is_active,p_sort_order)
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_upsert_master(bigint,uuid,text,text,text,text,jsonb,boolean,int) to anon, authenticated;

-- =========================================================
--  ADMIN RPC: УСЛУГИ МАСТЕРА
-- =========================================================
create or replace function public.admin_set_master_services(
  p_admin_tg_id bigint, p_master_id uuid, p_service_ids uuid[]
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where telegram_id = p_admin_tg_id) then
    raise exception 'Access denied'; end if;
  delete from public.master_services where master_id = p_master_id;
  insert into public.master_services (master_id, service_id) select p_master_id, unnest(p_service_ids);
  return true;
end; $$;
grant execute on function public.admin_set_master_services(bigint,uuid,uuid[]) to anon, authenticated;

-- =========================================================
--  ДАННЫЕ: УСЛУГИ
-- =========================================================
insert into public.services (name, category, price, duration_min, description, is_popular, sort_order) values
('Мужская стрижка','haircut',1800,40,'Стрижка волос с комбинированным применением инструмента',true,10),
('Удлинённая стрижка ножницами','haircut',2000,60,'Стрижка волос с применением ножниц',false,20),
('Удлинённая стрижка (до плеч)','haircut',2400,75,'Стрижка на длинные волосы',false,30),
('Стрижка машинкой / плавный переход','haircut',1500,30,'Стрижка машинкой с плавными переходами',false,40),
('Стрижка машинкой (одна длина)','haircut',700,25,'Одна длина, окантовка, мытьё и массаж',false,50),
('Стрижка школьника (до 14 лет)','haircut',1500,40,'Стрижка с 7 до 14 лет',false,60),
('Окантовка','haircut',500,15,'Чёткий контур по краевой линии роста волос',false,70),
('Стрижка бороды (с бритьём)','beard',1200,35,'Моделирование бороды с опасной бритвой',true,10),
('Стрижка бороды (без бритья)','beard',1000,25,'Моделирование бороды без бритья',false,20),
('Бритьё лица','beard',1500,30,'Королевское бритьё опасной бритвой',true,30),
('Бритьё головы','beard',1500,30,'Бритьё головы опасной бритвой',false,40),
('Стрижка и борода (без бритья)','combo',2800,60,'Стрижка и моделирование бороды',true,10),
('Стрижка и борода (с бритьём)','combo',3000,70,'Стрижка, борода и королевское бритьё',true,20),
('Папа с сыном','combo',3000,75,'Комплекс — две стрижки',false,30),
('Тонирование волос','coloring',1300,45,'Тонирование профессиональными составами',false,10),
('Тонирование бороды','coloring',1200,30,'Закрашивание седины бороды',false,20),
('Укладка волос праздничная','coloring',700,30,'Праздничная укладка',false,30),
('СПА процедура','spa',700,45,'СПА для лица и кожи головы',false,10),
('Чёрная маска для лица','spa',700,20,'Очищающая чёрная маска',false,20),
('Депиляция воском (1 зона)','spa',300,15,'Депиляция одной зоны',false,30),
('Депиляция воском (3 зоны)','spa',500,25,'Депиляция трёх зон',false,40)
on conflict do nothing;

-- ДЕМО-МАСТЕРА
insert into public.masters (name, specialization, bio, rating, schedule, sort_order) values
('Иван Соколов','Топ-мастер · 8 лет опыта','Классические мужские стрижки.',4.9,'{"type":"5/2","start_time":"10:00","end_time":"22:00","anchor_date":"2026-01-01"}'::jsonb,10),
('Артём Павлов','Барбер · Бороды, бритьё','Мастер опасной бритвы.',4.8,'{"type":"2/2","start_time":"10:00","end_time":"22:00","anchor_date":"2026-01-01"}'::jsonb,20),
('Дмитрий Климов','Барбер · Детские стрижки','Работает с детьми и взрослыми.',4.7,'{"type":"3/3","start_time":"15:00","end_time":"22:00","anchor_date":"2026-01-01"}'::jsonb,30),
('Михаил Зайцев','Топ-мастер · Классика','Классика и ретро-стиль.',5.0,'{"type":"5/2","start_time":"10:00","end_time":"22:00","anchor_date":"2026-01-02"}'::jsonb,40)
on conflict do nothing;

insert into public.master_services (master_id, service_id)
select m.id, s.id from public.masters m cross join public.services s
on conflict do nothing;
