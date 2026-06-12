-- ════════════════════════════════════════════════════════════════════════
-- AfriReçu — Table des reçus de paiement infalsifiables
-- À exécuter dans ton projet Supabase (SQL Editor).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists receipts (
  id              text primary key,          -- AFR-AAAAMMJJ-XXXXXX
  amount          numeric not null,
  currency        text not null default 'XOF',
  gateway         text not null,             -- cinetpay | flutterwave | kkiapay | mobile
  gateway_tx_id   text not null,             -- preuve de la passerelle (anti-fraude)
  payer_name      text default '',
  payer_phone     text default '',
  payer_email     text default '',
  merchant_id     text default '',
  merchant_name   text default '',
  merchant_email  text default '',
  description     text default '',
  items           jsonb default '[]'::jsonb,
  paid_at         timestamptz not null,
  signature       text not null,             -- HMAC-SHA256 (infalsifiable)
  short_code      text not null,             -- code court affiché (8 car.)
  verify_url      text default '',
  created_at      timestamptz default now()
);

create index if not exists idx_receipts_merchant on receipts (merchant_id, created_at desc);
create index if not exists idx_receipts_gateway_tx on receipts (gateway_tx_id);

-- Sécurité : la lecture publique sert à la vérification (QR code),
-- mais on n'expose que via l'API qui filtre les champs sensibles.
alter table receipts enable row level security;

create policy "Lecture pour vérification"
  on receipts for select using (true);

create policy "Écriture serveur uniquement"
  on receipts for insert with check (true);

-- NB : en production, restreindre l'écriture au service_role uniquement
-- et la lecture publique aux seuls champs nécessaires via une vue.
