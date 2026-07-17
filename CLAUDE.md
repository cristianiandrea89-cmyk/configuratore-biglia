# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Configuratore Offerte Biglia

Web app interna a F. Scassellati srl per generare offerte commerciali per torni CNC Biglia:
si sceglie cliente + modello, si spuntano gli optional dal listino, l'app calcola il totale e
genera un PDF in stile "conferma d'ordine" (prosa, non tabella prezzi). Sostituisce un processo
manuale (template Word compilato a mano da una segretaria). Progetto gemello di **Scassellati
Radar** (`APP MAPPATURA MACCHINE`, cartella sorella), di cui replica lo stack e alcuni pattern
(`useCurrentUser`, design system), ma con repository e database Supabase indipendenti.

## Comandi di sviluppo

```
npm install       # installa le dipendenze
npm run dev       # dev server Vite (esposto in rete locale, vedi vite.config.js)
npm run build     # build di produzione
npm run preview   # serve la build di produzione in locale
npm run lint      # oxlint (config in .oxlintrc.json)
```

Non esiste una suite di test automatici in questo progetto.

Il database (Postgres su Supabase) non ha migrazioni gestite da un tool: lo schema vive in
`schema.sql` (idempotente, `create table if not exists`). Modifiche successive allo schema live
(es. nuove colonne) sono state applicate a mano nell'SQL Editor di Supabase e poi riportate in
`schema.sql` per tenerlo aggiornato come riferimento — non esiste un log separato di migrazioni.
Le chiavi (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) vanno in `.env` (vedi `.env.example`);
`SUPABASE_SERVICE_ROLE_KEY` serve solo agli script one-shot in `scripts/` (mai usata dal client).

## Architettura del codice

- **Stack**: React 19 + Vite 8 + Tailwind v4 (plugin `@tailwindcss/vite`, nessun
  `tailwind.config.js` — token colore/font in `src/index.css` via `@theme`: `--color-bronze`,
  `--color-dgray`, ecc.). Routing con `react-router-dom`, composto in `src/App.jsx`. Nessun
  login/account utente: `useCurrentUser` (`src/hooks/useCurrentUser.jsx`) tiene solo il nome del
  venditore per-dispositivo in localStorage, per popolare "creato da"/"inserito da" — non è
  autenticazione.
- **Nessun backend proprio**: ogni pagina in `src/pages` chiama direttamente le funzioni in
  `src/lib/*.js` (un file per dominio: `clienti.js`, `modelli.js`, `offerte.js`, `suggerimenti.js`,
  `csvPrezzi.js`) che parlano con Supabase via `src/lib/supabaseClient.js`. RLS aperta
  (`using (true)`) su tutte le tabelle.
- **Versionamento invece di update in place**: sia `modelli` (cambio prezzi/listino) sia le
  offerte già generate non vengono mai sovrascritte nei dati storici. Un aggiornamento prezzi
  (`src/lib/csvPrezzi.js`, pagina `/aggiorna-prezzi`) crea una **nuova riga `modelli`** (nuova
  `data_listino`, `attivo=false` finché non è pronta) con le `voci_opzionali` ricopiate e i
  prezzi aggiornati, poi disattiva la vecchia versione e attiva la nuova — mai un `update` diretto
  sui prezzi esistenti. Ogni `offerte` salva il proprio `prezzo_base_snapshot`/`totale`/condizioni
  al momento della generazione (`offerte_voci` idem con `descrizione_snapshot`/`prezzo_snapshot`),
  così un cambio di listino successivo non altera offerte già create.
- **Bozze e ripresa configurazione**: ogni offerta creata parte con `stato='bozza'` (nessun
  meccanismo di transizione a "inviata"/"confermata" è ancora implementato). `NuovaOffertaPage.jsx`
  è usata sia per creare sia per modificare: la route `/offerte/:id/modifica` precarica
  cliente/modello/voci selezionate/quantità/condizioni dalla bozza esistente e il salvataggio
  chiama `aggiornaOfferta()` invece di `creaOfferta()` (in `src/lib/offerte.js`), sostituendo
  interamente le `offerte_voci` invece di fare un diff. `cliente_id` su `offerte` è nullable: si
  può salvare una bozza senza cliente indicato.
- **Import dei listini (one-shot, non a runtime)**: i Master Biglia (26 modelli/varianti,
  originariamente `.doc`) vengono convertiti in `.docx` fuori dal repo (Word COM automation via
  PowerShell — Vercel non ha Word/LibreOffice), poi `scripts/parse-master.mjs` li parsa in JSON
  intermedi in `scripts/import-output/` (non committati), infine `scripts/seed-modelli.mjs` /
  `scripts/reseed-voci.mjs` li caricano su Supabase con la service-role key. Il parser distingue
  `optional_macchina` (prosa) da `accessori_catalogo` (codice+descrizione+prezzo) e in
  `guessGruppo()` dà **priorità al prefisso del codice catalogo sul testo della descrizione**
  (es. un mandrinetto T134 la cui descrizione contiene "pinza ER" va comunque in "Mandrinetti
  motorizzati", non in "Extra dotazione" solo perché nomina una pinza).
- **Note di contesto** (`src/data/noteVoci.json`, generato da `scripts/genera-note-voci.mjs`):
  frasi del Master che non sono una voce acquistabile ma un'introduzione a un gruppo di voci
  (es. "Kit di riduzione sui portapinza...", "Versione RADIALE:") o un'avvertenza legata a una
  voce specifica. Convenzione chiave: `primaVoceCodice` presente → nota mostrata *sopra* quella
  voce; `primaVoceCodice: null` → nota di chiusura sezione, mostrata *in fondo* al gruppo
  (`NuovaOffertaPage.jsx` distingue i due casi costruendo due mappe separate).
- **Archivio storico**: `scripts/estrai-offerte-storiche.mjs` + `analizza-offerte-storiche.mjs`
  processano ~150 offerte Word reali pre-esistenti (non generate dall'app) in
  `src/data/offerteStoriche.json` (metadati leggeri, sempre in bundle) e
  `offerteStoricheTesti.json` (testi completi, ~3.7MB, importato dinamicamente solo quando si apre
  il dettaglio di un'offerta storica) più `suggerimentiStorici.json` (frequenza voci per modello).
  Storico e Suggerimenti in-app fondono questi dati statici con le query live su Supabase.
- **Word, non più PDF**: il documento finale generato per il cliente è un `.docx` costruito
  lato client con la libreria `docx` (`src/pdf/offertaWord.js`, funzione `generaWordOfferta`,
  usata dal pulsante "Scarica Word" in `OffertaDettaglioPage.jsx`), pensato per essere
  ritoccabile a mano prima dell'invio (coerente col vecchio processo manuale che sostituisce).
  Usa le stesse funzioni di prosa/raggruppamento di `src/lib/testoVoce.js` della UI del
  configuratore, con `Table`/`TableRow`/`TableCell` senza bordi per le righe etichetta/valore
  (caratteristiche tecniche, condizioni di fornitura). Mostra il prezzo per ogni voce
  optional/accessorio selezionata (non solo il totale finale) — scelta esplicita dell'utente,
  diversa dal formato "conferma d'ordine" senza prezzi riga con cui è partito il progetto
  (vedi piano iniziale). Al posto di un'anteprima del documento, `OffertaDettaglioPage.jsx`
  mostra un riepilogo testuale semplice (versione scelta + accessori aggiunti + totale)
  direttamente nella pagina.
  **Storia**: in precedenza il documento era generato con `@react-pdf/renderer`
  (`src/pdf/OffertaDocument.jsx`, ora rimosso) mostrato in anteprima prima del download. Due
  bug di quella libreria/approccio (compressione che a volte corrompeva il flate stream di una
  pagina; un `<iframe src={blobUrl}>` che restava nero in Chromium indipendentemente dalla
  validità del file) hanno portato a scartare del tutto anteprima e PDF in favore del Word
  diretto + riepilogo in pagina.
- **Dev server**: `vite.config.js` forza `watch.usePolling` (cartella sincronizzata OneDrive,
  `fs.watch` nativo perde eventi) e `host: true` per testare da mobile sulla stessa Wi-Fi.
- **Deploy**: Vercel, repo su GitHub (`cristianiandrea89-cmyk/configuratore-biglia`), push su
  `main` = deploy automatico. `vercel.json` fa da rewrite SPA (ogni route serve `index.html`),
  altrimenti il reload/link diretto su una route diversa da `/` darebbe 404. Variabili
  d'ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) da impostare nelle Settings del
  progetto Vercel, non nel repo.
