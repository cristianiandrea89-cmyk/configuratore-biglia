// Aggiorna solo il campo 'gruppo' delle voci_opzionali già importate, usando i
// JSON rigenerati da parse-master.mjs (che ora preserva i titoli reali del
// Master, es. 'ATTREZZI di PRESA MANDRINO ASA 8” foro 82...'). Non tocca
// prezzo/descrizione/altri campi.
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

    let aggiornati = 0
    for (const v of json.voci_opzionali) {
      if (!v.codice || v.categoria !== 'accessori_catalogo') continue
      const { data, error } = await supabase
        .from('voci_opzionali')
        .update({ gruppo: v.gruppo })
        .eq('modello_id', modello.id)
        .eq('codice', v.codice)
        .select()
      if (error) {
        console.error(`  errore ${json.codice} ${v.codice}: ${error.message}`)
        continue
      }
      aggiornati += data.length
    }
    console.log(`${json.codice}: ${aggiornati} voci aggiornate`)
  }
}

main()
