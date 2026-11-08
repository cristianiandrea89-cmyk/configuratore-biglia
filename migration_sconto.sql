-- Sconto commerciale sull'offerta (percentuale). Il netto arrotondato alle centinaia e
-- l'importo dello sconto si calcolano a partire da `totale` (che resta il totale di listino).
-- Eseguire una volta nell'SQL Editor di Supabase (idempotente).
alter table offerte add column if not exists sconto_percentuale numeric(5,2);
comment on column offerte.sconto_percentuale is 'Sconto % applicato al totale di listino; null = nessuno sconto. Il Word mostra "SCONTO x%" + netto riservato oppure solo il netto, a scelta di chi scarica.';
