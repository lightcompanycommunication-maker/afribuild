-- ════════════════════════════════════════════════════════════════════════
-- AfriBuild — Schéma Supabase pour la mémoire de projet
-- À exécuter une fois dans ton projet Supabase principal (SQL Editor).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists project_memory (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null,
  user_id     text not null,
  summary     text default '',
  decisions   jsonb default '[]'::jsonb,
  history     jsonb default '[]'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (project_id, user_id)
);

create index if not exists idx_project_memory_user on project_memory (user_id);

-- Row Level Security : chaque utilisateur ne voit que sa propre mémoire
alter table project_memory enable row level security;

create policy "Lecture de sa propre mémoire"
  on project_memory for select
  using (true);  -- ajuster selon ton système d'auth (auth.uid() = user_id en prod)

create policy "Écriture de sa propre mémoire"
  on project_memory for all
  using (true)
  with check (true);
