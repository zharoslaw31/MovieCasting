-- «Кастинг удвох»: спільні кімнати. Виконайте один раз у Supabase → SQL Editor → New query → Run.

create table if not exists public.rooms (
  code text primary key,
  host uuid not null default auth.uid() references auth.users on delete cascade,
  title text,
  filters jsonb,
  deck jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.rooms add column if not exists filters jsonb;

create table if not exists public.room_members (
  code text not null references public.rooms on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text,
  avatar text,
  joined_at timestamptz not null default now(),
  primary key (code, user_id)
);

create table if not exists public.room_swipes (
  code text not null references public.rooms on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_id integer not null,
  liked boolean not null,
  at timestamptz not null default now(),
  primary key (code, user_id, movie_id)
);

-- чи є поточний користувач учасником кімнати (security definer — щоб правила не зациклювались)
create or replace function public.is_room_member(c text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.room_members where code = c and user_id = auth.uid())
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_swipes enable row level security;

drop policy if exists "rooms: read by code" on public.rooms;
drop policy if exists "rooms: create" on public.rooms;
drop policy if exists "rooms: members update" on public.rooms;
drop policy if exists "rooms: host delete" on public.rooms;
create policy "rooms: read by code" on public.rooms for select to authenticated using (true);
create policy "rooms: create" on public.rooms for insert to authenticated with check (host = auth.uid());
create policy "rooms: members update" on public.rooms for update to authenticated using (public.is_room_member(code));
create policy "rooms: host delete" on public.rooms for delete to authenticated using (host = auth.uid());

drop policy if exists "members: read" on public.room_members;
drop policy if exists "members: join" on public.room_members;
drop policy if exists "members: update self" on public.room_members;
drop policy if exists "members: leave" on public.room_members;
create policy "members: read" on public.room_members for select to authenticated using (public.is_room_member(code));
create policy "members: join" on public.room_members for insert to authenticated with check (user_id = auth.uid());
create policy "members: update self" on public.room_members for update to authenticated using (user_id = auth.uid());
create policy "members: leave" on public.room_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "swipes: read" on public.room_swipes;
drop policy if exists "swipes: add" on public.room_swipes;
drop policy if exists "swipes: change" on public.room_swipes;
create policy "swipes: read" on public.room_swipes for select to authenticated using (public.is_room_member(code));
create policy "swipes: add" on public.room_swipes for insert to authenticated with check (user_id = auth.uid() and public.is_room_member(code));
create policy "swipes: change" on public.room_swipes for update to authenticated using (user_id = auth.uid());
