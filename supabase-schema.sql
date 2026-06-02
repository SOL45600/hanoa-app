-- ============================================================
-- HANOA — Script SQL à exécuter dans Supabase SQL Editor
-- https://app.supabase.com -> votre projet -> SQL Editor -> New query
-- ============================================================

-- 1. Table des sections (rubriques)
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text not null default 'ti-folder',
  parent_id uuid references sections(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Table des posts (messages du feed)
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 3. Table des commentaires
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  check (
    (post_id is not null and document_id is null) or
    (post_id is null and document_id is not null)
  )
);

-- 4. Table des documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- 5. Table profils utilisateurs
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  initials text not null,
  color text not null default '#0f6e56',
  updated_at timestamptz default now()
);

-- Trigger auto-création profil à l'inscription
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, initials, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'initials', upper(left(split_part(new.email, '@', 1), 2))),
    coalesce(new.raw_user_meta_data->>'color', '#0f6e56')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- Row Level Security (RLS) — tous les utilisateurs connectés
-- peuvent tout lire/écrire (ajustez si besoin)
-- ============================================================

alter table sections enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table documents enable row level security;
alter table profiles enable row level security;

-- Sections : lecture pour tous, écriture pour tous les auth
create policy "sections_select" on sections for select using (auth.role() = 'authenticated');
create policy "sections_insert" on sections for insert with check (auth.role() = 'authenticated');
create policy "sections_update" on sections for update using (auth.role() = 'authenticated');
create policy "sections_delete" on sections for delete using (auth.role() = 'authenticated');

-- Posts
create policy "posts_select" on posts for select using (auth.role() = 'authenticated');
create policy "posts_insert" on posts for insert with check (auth.uid() = author_id);
create policy "posts_delete" on posts for delete using (auth.uid() = author_id);

-- Comments
create policy "comments_select" on comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on comments for insert with check (auth.uid() = author_id);
create policy "comments_delete" on comments for delete using (auth.uid() = author_id);

-- Documents
create policy "documents_select" on documents for select using (auth.role() = 'authenticated');
create policy "documents_insert" on documents for insert with check (auth.uid() = author_id);
create policy "documents_delete" on documents for delete using (auth.uid() = author_id);

-- Profiles
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- ============================================================
-- Storage bucket pour les fichiers
-- ============================================================
insert into storage.buckets (id, name, public) values ('hanoa-files', 'hanoa-files', false)
on conflict do nothing;

create policy "storage_select" on storage.objects for select using (auth.role() = 'authenticated');
create policy "storage_insert" on storage.objects for insert with check (auth.role() = 'authenticated');
create policy "storage_delete" on storage.objects for delete using (auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- Données initiales : rubriques HANOA
-- ============================================================
with
  vergers as (
    insert into sections (label, icon, sort_order) values ('Les vergers', 'ti-tree', 1) returning id
  ),
  transfo as (
    insert into sections (label, icon, sort_order) values ('La transformation', 'ti-settings', 2) returning id
  ),
  parcelles as (
    insert into sections (label, icon, parent_id, sort_order)
    select 'Parcelles', 'ti-map-pin', id, 1 from vergers returning id, parent_id
  )
select
  (insert into sections (label, icon, parent_id, sort_order) select 'Irrigation', 'ti-droplet', id, 2 from vergers),
  (insert into sections (label, icon, parent_id, sort_order) select 'Fertilisation', 'ti-chemistry', id, 3 from vergers),
  (insert into sections (label, icon, parent_id, sort_order) select 'Phyto-lutte maladies/ravageurs', 'ti-bug', id, 4 from vergers),
  (insert into sections (label, icon, parent_id, sort_order) select 'Réglementaire', 'ti-clipboard-list', id, 5 from vergers),
  (insert into sections (label, icon, parent_id, sort_order) select 'Machines', 'ti-tool', id, 1 from transfo),
  (insert into sections (label, icon, parent_id, sort_order) select 'Stock', 'ti-package', id, 2 from transfo),
  (insert into sections (label, icon, parent_id, sort_order) select 'Réglementaires', 'ti-clipboard-list', id, 3 from transfo);

insert into sections (label, icon, parent_id, sort_order)
select label, 'ti-plant-2', (select id from parcelles limit 1), row_number() over ()
from unnest(array['Parcelle 1A','Parcelle B1','Parcelle B2','Parcelle C','Parcelle D1','Parcelle D2','Parcelle E']) as label;
