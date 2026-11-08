// Sconto commerciale sull'offerta. Nelle offerte Biglia storiche lo sconto compare in due modi:
//   - "SCONTO 20% - € 46.100,00" seguito da "PREZZO NETTO A VOI RISERVATO € 184.400,00"
//   - solo "PREZZO NETTO A VOI RISERVATO € ..." senza mostrare lo sconto.
// Il netto è arrotondato alle centinaia (scelta di Andrea, 8/11/26) e l'importo dello sconto è
// ricavato come differenza (totale - netto), così le cifre stampate quadrano sempre.
export function calcolaSconto(totale, percentuale) {
  const p = Number(percentuale)
  if (!(p > 0) || p >= 100) return null
  const lordo = Number(totale)
  const netto = Math.round((lordo * (1 - p / 100)) / 100) * 100
  const importoSconto = lordo - netto
  if (importoSconto <= 0) return null
  return { percentuale: p, lordo, netto, importoSconto }
}

// Percentuale letta da un campo di testo ("20", "12,5"): numero valido tra 0 e 100 esclusi, o null.
export function leggiPercentuale(testo) {
  const p = Number(String(testo ?? '').trim().replace(',', '.'))
  return p > 0 && p < 100 ? p : null
}
