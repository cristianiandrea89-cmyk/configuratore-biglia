// Sostituisce interamente le voci_opzionali di ogni modello con quelle dei
// JSON più recenti in scripts/import-output (dopo l'estrazione delle
// intestazioni reali dalle text-box). Non tocca la riga modelli (prezzo_base,
// descrizione_base, ecc. restano quelli già presenti e verificati).
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import 'dotenv/config'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const cartella = 'scripts/import-output'

async function main() {
  const files = readdirSync(cartella).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(cartella, f), 'utf-8'))
    const { data: modello, error: errModello } = await supabase
      .from('modelli')
      .select('id')
      .eq('codice', json.codice)
      .eq('attivo', true)
      .maybeSingle()
    if (errModello || !modello) {
      console.error(`SALTATO: ${json.codice} - modello non trovato in DB`)
      continue
    }

    const { error: errDelete } = await supabase.from('voci_opzionali').delete().eq('modello_id', modello.id)
    if (errDelete) {
      console.error(`ERRORE cancellazione ${json.codice}: ${errDelete.message}`)
      continue
    }

    const voci = json.voci_opzionali.map((v) => ({
      modello_id: modello.id,
      categoria: v.categoria,
      gruppo: v.gruppo,
      codice: v.codice,
      descrizione: v.descrizione,
      tipo_prezzo: v.tipo_prezzo,
      prezzo: v.prezzo,
      ordine: v.ordine,
    }))
    if (voci.length) {
      const { error: errInsert } = await supabase.from('voci_opzionali').insert(voci)
      if (errInsert) {
        console.error(`ERRORE inserimento ${json.codice}: ${errInsert.message}`)
        continue
      }
    }
    console.log(`${json.codice}: ${voci.length} voci reimportate`)
  }
}

main()
