import { supabase } from './supabaseClient'
import { normalizza } from './normalizza'

export async function fetchClienti() {
  const { data, error } = await supabase.from('clienti').select('*').order('ragione_sociale')
  if (error) throw error
  return data
}

// Trova un cliente per ragione sociale (confronto tollerante) o lo crea se non esiste.
export async function trovaOCreaCliente({ ragioneSociale, indirizzo, citta, referenteNome, creatoDa }) {
  const nomeTrim = ragioneSociale.trim()
  const nomeNormalizzato = normalizza(nomeTrim)

  const { data: tutti, error: findErr } = await supabase.from('clienti').select('*')
  if (findErr) throw findErr

  const esistente = tutti.find((c) => normalizza(c.ragione_sociale) === nomeNormalizzato)
  if (esistente) return esistente

  const { data, error } = await supabase
    .from('clienti')
    .insert({
      ragione_sociale: nomeTrim,
      indirizzo: indirizzo || null,
      citta: citta || null,
      referente_nome: referenteNome || null,
      creato_da: creatoDa || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
