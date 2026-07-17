import { supabase } from './supabaseClient'

// Ordine commerciale delle serie nel menu (dalla più piccola alla più grande),
// non alfabetico: 'B1250' finirebbe prima di 'B620' se ordinato come stringa.
const ORDINE_SERIE = ['B620', 'B750', 'B1250', 'BMX']

export async function fetchModelliAttivi() {
  const { data, error } = await supabase
    .from('modelli')
    .select('id, codice, nome_commerciale, sottotitolo, serie, prezzo_base')
    .eq('attivo', true)
    .order('nome_commerciale')
  if (error) throw error
  return [...data].sort((a, b) => ORDINE_SERIE.indexOf(a.serie) - ORDINE_SERIE.indexOf(b.serie))
}

export async function fetchModelloConVoci(modelloId) {
  const { data: modello, error: errModello } = await supabase
    .from('modelli')
    .select('*')
    .eq('id', modelloId)
    .single()
  if (errModello) throw errModello

  const { data: voci, error: errVoci } = await supabase
    .from('voci_opzionali')
    .select('*')
    .eq('modello_id', modelloId)
    .order('ordine')
  if (errVoci) throw errVoci

  return { ...modello, voci_opzionali: voci }
}

export async function fetchCondizioniStandard() {
  const { data, error } = await supabase
    .from('condizioni_standard')
    .select('*')
    .eq('attivo', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
