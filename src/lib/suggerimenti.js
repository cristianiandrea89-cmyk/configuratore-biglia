import { supabase } from './supabaseClient'
import { normalizza } from './normalizza'
// Frequenze pre-calcolate dalle offerte Word storiche (2014-2026) con
// scripts/analizza-offerte-storiche.mjs: l'app parte con zero offerte proprie,
// ma l'archivio commerciale ne ha centinaia — è quello il vero storico.
import suggerimentiStorici from '../data/suggerimentiStorici.json'

// Voci più frequenti nelle offerte passate per questo modello, per suggerire
// "di solito non ti scordare questa" durante la configurazione.
export async function fetchOptionalPopolariPerModello(modelloId, { limit = 5 } = {}) {
  const { data: offerte, error: errOfferte } = await supabase
    .from('offerte')
    .select('id')
    .eq('modello_id', modelloId)
  if (errOfferte) throw errOfferte
  if (!offerte.length) return []

  const { data: voci, error: errVoci } = await supabase
    .from('offerte_voci')
    .select('voce_opzionale_id')
    .in('offerta_id', offerte.map((o) => o.id))
  if (errVoci) throw errVoci

  const conteggi = {}
  voci.forEach((v) => {
    conteggi[v.voce_opzionale_id] = (conteggi[v.voce_opzionale_id] || 0) + 1
  })

  return Object.entries(conteggi)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([voceOpzionaleId, conteggio]) => ({ voceOpzionaleId, conteggio, totaleOfferte: offerte.length }))
}

// Suggerimenti completi per un modello: unisce le offerte fatte nell'app
// (per id voce) con quelle dell'archivio Word storico (per codice voce o
// prefisso descrizione, gli id non esistevano). Restituisce direttamente le
// voci del modello caricato, pronte per il box Suggerimenti.
export async function fetchSuggerimentiPerModello(modello, { limit = 6 } = {}) {
  const dalDb = await fetchOptionalPopolariPerModello(modello.id, { limit: 20 }).catch(() => [])
  const storico = suggerimentiStorici[modello.codice] || { totaleOfferte: 0, voci: [] }
  const totaleOfferte =
    (dalDb.length ? dalDb[0].totaleOfferte : 0) + storico.totaleOfferte

  const perVoce = new Map()
  function aggiungi(voce, conteggio) {
    if (!voce) return
    perVoce.set(voce.id, { voce, conteggio: (perVoce.get(voce.id)?.conteggio || 0) + conteggio })
  }

  dalDb.forEach((p) => {
    aggiungi(modello.voci_opzionali.find((v) => v.id === p.voceOpzionaleId), p.conteggio)
  })
  storico.voci.forEach((s) => {
    const voce = s.codice
      ? modello.voci_opzionali.find((v) => v.codice === s.codice)
      : modello.voci_opzionali.find((v) => normalizza(v.descrizione).slice(0, 60) === s.descNorm)
    aggiungi(voce, s.conteggio)
  })

  return [...perVoce.values()]
    .sort((a, b) => b.conteggio - a.conteggio)
    .slice(0, limit)
    .map((r) => ({ ...r, totaleOfferte }))
}

// Ultima configurazione fatta per questo cliente (qualsiasi modello), per
// suggerire "per questo cliente avevi aggiunto anche...".
export async function fetchUltimaConfigurazionePerCliente(clienteId) {
  const { data: ultimaOfferta, error: errOfferta } = await supabase
    .from('offerte')
    .select('id, modello_id, created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (errOfferta) throw errOfferta
  if (!ultimaOfferta) return null

  const { data: voci, error: errVoci } = await supabase
    .from('offerte_voci')
    .select('voce_opzionale_id, descrizione_snapshot')
    .eq('offerta_id', ultimaOfferta.id)
  if (errVoci) throw errVoci

  return { offerta: ultimaOfferta, voci }
}
