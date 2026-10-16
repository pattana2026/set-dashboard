-- =====================================================================
-- SET Seal Tracker — Supabase setup
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
-- รันซ้ำได้ (สคริปต์เขียนให้รันทับของเดิมได้อย่างปลอดภัย ไม่ลบข้อมูล)
-- =====================================================================

-- ---------- 1) ผู้ใช้และสิทธิ์ ----------
-- role: admin  = Upload ไฟล์ได้ + บันทึกการติดตาม + จัดการสิทธิ์ผู้ใช้
--       staff  = บันทึกการติดตามได้
--       viewer = ดูอย่างเดียว (ค่าเริ่มต้นของผู้ใช้ใหม่)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  role         text not null default 'viewer' check (role in ('admin','staff','viewer')),
  created_at   timestamptz not null default now()
);

-- สิทธิ์ของผู้ใช้ที่ Log in อยู่ (security definer เพื่อไม่ให้ RLS วนซ้ำ)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- สร้าง profile อัตโนมัติเมื่อมีการสร้าง User ใหม่ใน Authentication
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := split_part(new.email, '@', 1);
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    uname,
    coalesce(new.raw_user_meta_data->>'display_name', uname),
    case when not exists (select 1 from public.profiles) then 'admin' else 'viewer' end  -- คนแรกเป็น admin
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- เติม profile ให้ User ที่สร้างไว้ก่อนรันสคริปต์นี้
insert into public.profiles (id, username, display_name, role)
select u.id, split_part(u.email,'@',1), split_part(u.email,'@',1), 'viewer'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
-- ถ้ายังไม่มี admin เลย ให้ User ที่สร้างก่อนสุดเป็น admin
update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at, id limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- ---------- 2) ข้อมูลงานตีตรา ----------
-- แต่ละครั้งที่ Upload จะได้ batch_id ใหม่ แล้วค่อยสลับเป็นชุดปัจจุบันใน app_state
create table if not exists public.jobs (
  id         bigint generated always as identity primary key,
  batch_id   uuid not null,
  job_key    text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists jobs_batch_idx on public.jobs (batch_id, id);

-- สถานะปัจจุบัน (มีแถวเดียว)
create table if not exists public.app_state (
  id            int primary key default 1 check (id = 1),
  current_batch uuid,
  file_name     text,
  row_count     int,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz
);
insert into public.app_state (id) values (1) on conflict (id) do nothing;

-- ประวัติการ Upload
create table if not exists public.uploads (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null,
  file_name   text,
  row_count   int,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

-- ---------- 3) การติดตามลูกค้า (ผูกกับ Job no. ไม่หายเมื่อ Upload ใหม่) ----------
create table if not exists public.followups (
  job_key    text primary key,
  status     text not null default '' check (status in ('','contacted','waiting','renewed','declined')),
  note       text not null default '' check (char_length(note) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- บังคับให้ updated_by/updated_at มาจากเซิร์ฟเวอร์เสมอ (แก้จากหน้าเว็บไม่ได้)
create or replace function public.stamp_followup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists followups_stamp on public.followups;
create trigger followups_stamp before insert or update on public.followups
  for each row execute function public.stamp_followup();

-- ---------- 4) ฟังก์ชันสลับข้อมูลหลัง Upload (เฉพาะ admin) ----------
create or replace function public.finish_upload(p_batch uuid, p_file_name text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'เฉพาะผู้ดูแลที่ Upload ข้อมูลได้' using errcode = '42501';
  end if;
  select count(*) into n from public.jobs where batch_id = p_batch;
  if n = 0 then
    raise exception 'ไม่พบข้อมูลของการ Upload นี้';
  end if;
  update public.app_state
     set current_batch = p_batch, file_name = p_file_name, row_count = n,
         uploaded_by = auth.uid(), uploaded_at = now()
   where id = 1;
  insert into public.uploads (batch_id, file_name, row_count, uploaded_by)
  values (p_batch, p_file_name, n, auth.uid());
  -- ลบข้อมูลชุดเก่า (เก็บไว้เฉพาะชุดปัจจุบัน)
  delete from public.jobs where batch_id <> p_batch;
end $$;

-- ---------- 5) Row Level Security ----------
alter table public.profiles  enable row level security;
alter table public.jobs      enable row level security;
alter table public.app_state enable row level security;
alter table public.uploads   enable row level security;
alter table public.followups enable row level security;

-- profiles: ทุกคนที่ Log in เห็นชื่อกันได้, admin เปลี่ยนสิทธิ์ได้, แต่ละคนแก้ชื่อที่แสดงของตัวเองได้
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- กันไม่ให้คนทั่วไปเปลี่ยน role ของตัวเอง
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() เป็น null เมื่อแก้จาก SQL Editor / Table Editor ของ Supabase (ผู้ดูแลระบบ) จึงอนุญาต
  if new.role is distinct from old.role and auth.uid() is not null and public.my_role() is distinct from 'admin' then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนระดับผู้ใช้' using errcode = '42501';
  end if;
  if new.id = auth.uid() and old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'ต้องมีผู้ดูแลอย่างน้อย 1 คน';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- jobs: ทุกคนที่ Log in อ่านได้, admin เพิ่ม/ลบได้
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (true);
drop policy if exists jobs_admin_insert on public.jobs;
create policy jobs_admin_insert on public.jobs for insert to authenticated with check (public.my_role() = 'admin');
drop policy if exists jobs_admin_delete on public.jobs;
create policy jobs_admin_delete on public.jobs for delete to authenticated using (public.my_role() = 'admin');

-- app_state / uploads: อ่านได้ทุกคนที่ Log in (เขียนผ่าน finish_upload เท่านั้น)
drop policy if exists app_state_read on public.app_state;
create policy app_state_read on public.app_state for select to authenticated using (true);
drop policy if exists uploads_read on public.uploads;
create policy uploads_read on public.uploads for select to authenticated using (true);

-- followups: อ่านได้ทุกคนที่ Log in, admin/staff บันทึกได้
drop policy if exists followups_read on public.followups;
create policy followups_read on public.followups for select to authenticated using (true);
drop policy if exists followups_insert on public.followups;
create policy followups_insert on public.followups for insert to authenticated
  with check (public.my_role() in ('admin','staff'));
drop policy if exists followups_update on public.followups;
create policy followups_update on public.followups for update to authenticated
  using (public.my_role() in ('admin','staff')) with check (public.my_role() in ('admin','staff'));

-- ปิดสิทธิ์ทั้งหมดของผู้ที่ยังไม่ Log in
revoke all on public.profiles, public.jobs, public.app_state, public.uploads, public.followups from anon;
revoke execute on function public.finish_upload(uuid, text) from anon, public;
grant execute on function public.finish_upload(uuid, text) to authenticated;

-- ---------- 6) Realtime (ให้ทุกคนเห็นการเปลี่ยนแปลงทันที) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='app_state') then
      alter publication supabase_realtime add table public.app_state;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='followups') then
      alter publication supabase_realtime add table public.followups;
    end if;
  end if;
end $$;
