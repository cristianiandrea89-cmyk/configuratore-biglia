-- Configuratore Offerte Biglia — schema Supabase (Postgres)
-- Nessuna autenticazione: RLS aperta su tutte le tabelle (accesso libero, come da progetto).

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- MODELLI (un Master-*.doc per modello/variante Biglia)
-- ============================================================
create table if not exists modelli (
  id uuid primary key default gen_random_uuid(),
  codice text not null,                        -- es. 'B750M', 'BMX45Y2', 'B1250YB'
  nome_commerciale text not null,               -- es. 'Biglia B750 M'
  sottotitolo text,                             -- es. 'BASE più Motorizzati', dal listino Biglia: aiuta a distinguere le varianti in UI
  serie text,                                   -- 'B620' / 'B750' / 'B1250' / 'BMX'
  data_listino date not null,                   -- da 'Master-<MODEL>-01-2026-ITALIA' -> 2026-01-01
  descrizione_base text not null,               -- prosa dotazione standard
  specifiche_tecniche jsonb not null default '[]',
    -- [{ "etichetta": "Campo di lavoro: dia. tornibile", "valore": "mm. 350" }, ...]
  macroistruzioni text,                         -- elenco cicli CNC / macroistruzioni
  prezzo_base numeric(12,2) not null,           -- da 'PREZZO DI N. 1 TORNIO ... Euro X'
  attivo boolean not null default true,         -- il vecchio listino si disattiva, mai sovrascritto
  file_origine text,                            -- nome del Master-*.doc di provenienza
  creato_da text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table modelli is 'Un modello/variante Biglia (= un Master-*.doc), con prosa base e prezzo macchina base. Nuovo listino = nuova riga (attivo=true), il vecchio si disattiva (attivo=false): le offerte storiche restano coerenti con prezzo/testo vigente al momento della generazione.';
comment on column modelli.specifiche_tecniche is 'Coppie etichetta/valore da CARATTERISTICHE TECNICHE, ordine preservato nell''array';

create unique index if not exists idx_modelli_codice_attivo on modelli (codice) where attivo;
create index if not exists idx_modelli_serie on modelli (serie);
create index if not exists idx_modelli_attivo on modelli (attivo);

drop trigger if exists trg_modelli_updated_at on modelli;
create trigger trg_modelli_updated_at before update on modelli
  for each row execute function set_updated_at();

alter table modelli enable row level security;
create policy "modelli_select" on modelli for select using (true);
create policy "modelli_insert" on modelli for insert with check (true);
create policy "modelli_update" on modelli for update using (true);
create policy "modelli_delete" on modelli for delete using (true);

-- ============================================================
-- VOCI_OPZIONALI (righe figlie di un modello: optional + accessori a catalogo)
-- ============================================================
create table if not exists voci_opzionali (
  id uuid primary key default gen_random_uuid(),
  modello_id uuid not null references modelli (id) on delete cascade,
  categoria text not null check (categoria in ('optional_macchina', 'accessori_catalogo')),
  gruppo text,               -- 'Autocentranti', 'Portapinze', 'Mandrinetti motorizzati', ecc. (solo accessori)
  codice text,               -- codice catalogo (solo accessori), null per optional descrittivi
  descrizione text not null,
  tipo_prezzo text not null default 'aggiunta' check (tipo_prezzo in ('aggiunta', 'supplemento')),
    -- 'supplemento' = upgrade alternativo (mutuamente esclusivo nel proprio gruppo)
  prezzo numeric(12,2) not null,
  ordine integer not null default 0,     -- preserva l'ordine originale del Master in UI/documento
  created_at timestamptz not null default now()
);
comment on table voci_opzionali is 'Optional e accessori a catalogo di un modello, con prezzo e descrizione presi dal Master; lo snapshot dei prezzi al momento di un''offerta vive in offerte_voci, non qui.';

create index if not exists idx_voci_modello on voci_opzionali (modello_id);
create index if not exists idx_voci_categoria on voci_opzionali (modello_id, categoria);

alter table voci_opzionali enable row level security;
create policy "voci_opzionali_select" on voci_opzionali for select using (true);
create policy "voci_opzionali_insert" on voci_opzionali for insert with check (true);
create policy "voci_opzionali_update" on voci_opzionali for update using (true);
create policy "voci_opzionali_delete" on voci_opzionali for delete using (true);

-- ============================================================
-- CLIENTI (leggero, non CRM — solo per intestare offerte)
-- ============================================================
create table if not exists clienti (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  indirizzo text,
  citta text,
  referente_nome text,        -- 'Alla C.A. ...'
  creato_da text,
  created_at timestamptz not null default now()
);
comment on table clienti is 'Anagrafica clienti minima, solo per intestazione offerte Biglia (non è il CRM aziendale)';

create unique index if not exists idx_clienti_ragione_sociale_unique on clienti (lower(ragione_sociale));

alter table clienti enable row level security;
create policy "clienti_select" on clienti for select using (true);
create policy "clienti_insert" on clienti for insert with check (true);
create policy "clienti_update" on clienti for update using (true);
create policy "clienti_delete" on clienti for delete using (true);

-- ============================================================
-- CONDIZIONI_STANDARD (default correnti, editabili per-offerta)
-- ============================================================
create table if not exists condizioni_standard (
  id uuid primary key default gen_random_uuid(),
  consegna text,
  resa text,
  collaudo text,
  messa_in_funzione text,
  corso_programmazione text,
  pagamento text,
  garanzia text,
  validita_offerta text,
  attivo boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table condizioni_standard is 'Testi standard da CONDIZIONI DI FORNITURA°°.doc, usati come default precompilati in una nuova offerta; ogni offerta li può poi sovrascrivere liberamente.';

alter table condizioni_standard enable row level security;
create policy "condizioni_standard_select" on condizioni_standard for select using (true);
create policy "condizioni_standard_insert" on condizioni_standard for insert with check (true);
create policy "condizioni_standard_update" on condizioni_standard for update using (true);
create policy "condizioni_standard_delete" on condizioni_standard for delete using (true);

-- ============================================================
-- OFFERTE (header + condizioni per-offerta + totale)
-- ============================================================
create table if not exists offerte (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,          -- '2026-001' generato dall'app
  cliente_id uuid references clienti (id),  -- null = bozza salvata senza cliente ancora indicato
  modello_id uuid not null references modelli (id),
  titolo text,                          -- es. 'Conferma d''ordine' / 'Offerta'
  citta_data text,                      -- riga libera 'Roma, 12/07/2026'
  prezzo_base_snapshot numeric(12,2) not null,
  totale numeric(12,2) not null,        -- prezzo_base_snapshot + somma prezzi voci selezionate
  consegna text,
  resa text,
  collaudo text,
  messa_in_funzione text,
  corso_programmazione text,
  pagamento text,
  garanzia text,
  validita_offerta text,
  stato text not null default 'bozza' check (stato in ('bozza', 'inviata', 'confermata', 'persa')),
  creato_da text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table offerte is 'Header di ogni offerta generata: snapshot di prezzo e condizioni al momento della generazione, cosi le offerte gia inviate non cambiano retroattivamente se il listino o le condizioni standard cambiano dopo.';

create index if not exists idx_offerte_cliente on offerte (cliente_id);
create index if not exists idx_offerte_modello on offerte (modello_id);

drop trigger if exists trg_offerte_updated_at on offerte;
create trigger trg_offerte_updated_at before update on offerte
  for each row execute function set_updated_at();

alter table offerte enable row level security;
create policy "offerte_select" on offerte for select using (true);
create policy "offerte_insert" on offerte for insert with check (true);
create policy "offerte_update" on offerte for update using (true);
create policy "offerte_delete" on offerte for delete using (true);

-- ============================================================
-- OFFERTE_VOCI (join: quali optional/accessori selezionati + prezzo storicizzato)
-- ============================================================
create table if not exists offerte_voci (
  id uuid primary key default gen_random_uuid(),
  offerta_id uuid not null references offerte (id) on delete cascade,
  voce_opzionale_id uuid not null references voci_opzionali (id),
  descrizione_snapshot text not null,
  codice_snapshot text,                  -- codice catalogo (solo accessori), null per optional descrittivi
  prezzo_snapshot numeric(12,2) not null,
  quantita integer not null default 1,
  ordine integer not null default 0
);
comment on table offerte_voci is 'Snapshot delle voci selezionate in un''offerta: descrizione e prezzo copiati al momento della generazione. Alimenta anche i suggerimenti (frequenza di co-selezione per modello e per cliente).';

create index if not exists idx_offerte_voci_offerta on offerte_voci (offerta_id);
create index if not exists idx_offerte_voci_voce on offerte_voci (voce_opzionale_id);

alter table offerte_voci enable row level security;
create policy "offerte_voci_select" on offerte_voci for select using (true);
create policy "offerte_voci_insert" on offerte_voci for insert with check (true);
create policy "offerte_voci_update" on offerte_voci for update using (true);
create policy "offerte_voci_delete" on offerte_voci for delete using (true);

-- ============================================================
-- Numerazione offerte (per anno, scoped a questo db)
-- ============================================================
create table if not exists contatori_offerta (
  anno integer primary key,
  ultimo_numero integer not null default 0
);

alter table contatori_offerta enable row level security;
create policy "contatori_offerta_select" on contatori_offerta for select using (true);
create policy "contatori_offerta_insert" on contatori_offerta for insert with check (true);
create policy "contatori_offerta_update" on contatori_offerta for update using (true);

create or replace function genera_numero_offerta(anno_input integer)
returns text as $$
declare
  n integer;
begin
  insert into contatori_offerta (anno, ultimo_numero) values (anno_input, 1)
    on conflict (anno) do update set ultimo_numero = contatori_offerta.ultimo_numero + 1
    returning ultimo_numero into n;
  return anno_input || '-' || lpad(n::text, 3, '0');
end;
$$ language plpgsql;
