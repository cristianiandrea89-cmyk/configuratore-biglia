import { supabase } from './supabaseClient'

// Calcola prezzo_base_snapshot + totale e crea offerta + offerte_voci in un'unica operazione.
export async function creaOfferta({
  clienteId,
  modello,       // record modelli completo (da fetchModelloConVoci)
  vociSelezionate, // array di voci_opzionali selezionate (sottoinsieme di modello.voci_opzionali)
  titolo,
  cittaData,
  condizioni,    // { consegna, resa, collaudo, messa_in_funzione, corso_programmazione, pagamento, garanzia, validita_offerta }
  creatoDa,
}) {
  const anno = new Date().getFullYear()
  const { data: numero, error: errNumero } = await supabase.rpc('genera_numero_offerta', { anno_input: anno })
  if (errNumero) throw errNumero

  const totale =
    modello.prezzo_base + vociSelezionate.reduce((sum, v) => sum + Number(v.prezzo) * (v.quantita || 1), 0)

  const { data: offerta, error: errOfferta } = await supabase
    .from('offerte')
    .insert({
      numero,
      cliente_id: clienteId,
      modello_id: modello.id,
      titolo: titolo || null,
      citta_data: cittaData || null,
      prezzo_base_snapshot: modello.prezzo_base,
      totale,
      consegna: condizioni?.consegna || null,
      resa: condizioni?.resa || null,
      collaudo: condizioni?.collaudo || null,
      messa_in_funzione: condizioni?.messa_in_funzione || null,
      corso_programmazione: condizioni?.corso_programmazione || null,
      pagamento: condizioni?.pagamento || null,
      garanzia: condizioni?.garanzia || null,
      validita_offerta: condizioni?.validita_offerta || null,
      creato_da: creatoDa,
    })
    .select()
    .single()
  if (errOfferta) throw errOfferta

  if (vociSelezionate.length) {
    const righe = vociSelezionate.map((v, i) => ({
      offerta_id: offerta.id,
      voce_opzionale_id: v.id,
      descrizione_snapshot: v.descrizione,
      codice_snapshot: v.codice || null,
      prezzo_snapshot: v.prezzo,
      quantita: v.quantita || 1,
      ordine: i,
    }))
    const { error: errVoci } = await supabase.from('offerte_voci').insert(righe)
    if (errVoci) throw errVoci
  }

  return offerta
}

// Aggiorna un'offerta esistente (bozza ripresa dal configuratore): sostituisce
// interamente le offerte_voci invece di fare un diff, più semplice e sicuro
// dato che l'utente riparte sempre dall'intera configurazione in memoria.
export async function aggiornaOfferta(id, { clienteId, modello, vociSelezionate, titolo, cittaData, condizioni }) {
  const totale =
    modello.prezzo_base + vociSelezionate.reduce((sum, v) => sum + Number(v.prezzo) * (v.quantita || 1), 0)

  const { error: errOfferta } = await supabase
    .from('offerte')
    .update({
      cliente_id: clienteId,
      modello_id: modello.id,
      titolo: titolo || null,
      citta_data: cittaData || null,
      prezzo_base_snapshot: modello.prezzo_base,
      totale,
      consegna: condizioni?.consegna || null,
      resa: condizioni?.resa || null,
      collaudo: condizioni?.collaudo || null,
      messa_in_funzione: condizioni?.messa_in_funzione || null,
      corso_programmazione: condizioni?.corso_programmazione || null,
      pagamento: condizioni?.pagamento || null,
      garanzia: condizioni?.garanzia || null,
      validita_offerta: condizioni?.validita_offerta || null,
    })
    .eq('id', id)
  if (errOfferta) throw errOfferta

  const { error: errDelete } = await supabase.from('offerte_voci').delete().eq('offerta_id', id)
  if (errDelete) throw errDelete

  if (vociSelezionate.length) {
    const righe = vociSelezionate.map((v, i) => ({
      offerta_id: id,
      voce_opzionale_id: v.id,
      descrizione_snapshot: v.descrizione,
      codice_snapshot: v.codice || null,
      prezzo_snapshot: v.prezzo,
      quantita: v.quantita || 1,
      ordine: i,
    }))
    const { error: errVoci } = await supabase.from('offerte_voci').insert(righe)
    if (errVoci) throw errVoci
  }
}

// offerte_voci ha on delete cascade su offerta_id, quindi basta eliminare la riga offerte.
export async function eliminaBozza(id) {
  const { error } = await supabase.from('offerte').delete().eq('id', id).eq('stato', 'bozza')
  if (error) throw error
}

export async function fetchBozze() {
  const { data, error } = await supabase
    .from('offerte')
    .select('id, numero, totale, updated_at, clienti(ragione_sociale), modelli(nome_commerciale)')
    .eq('stato', 'bozza')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchOfferta(id) {
  const { data: offerta, error: errOfferta } = await supabase
    .from('offerte')
    .select('*, clienti(*), modelli(*)')
    .eq('id', id)
    .single()
  if (errOfferta) throw errOfferta

  const { data: voci, error: errVoci } = await supabase
    .from('offerte_voci')
    .select('*')
    .eq('offerta_id', id)
    .order('ordine')
  if (errVoci) throw errVoci

  return { ...offerta, voci_selezionate: voci }
}

export async function fetchStoricoOfferte() {
  const { data, error } = await supabase
    .from('offerte')
    .select('id, numero, titolo, totale, stato, creato_da, created_at, clienti(ragione_sociale), modelli(nome_commerciale)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
