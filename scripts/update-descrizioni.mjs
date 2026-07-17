// Aggiorna descrizione_base, macroistruzioni e specifiche_tecniche dei modelli
// già seedati con i valori più recenti dei JSON in scripts/import-output.
// Necessario perché il seed iniziale (seed-modelli.mjs) è stato fatto PRIMA
// della riscrittura del parser da mammoth a lettura diretta dell'XML, che ha
// recuperato testo nelle caselle di testo del Master (elenchi puntati sotto
// 'Principali vantaggi', 'L'evacuatore è completo di:', ecc.) e, più tardi, i
// gruppi ('Campo di lavoro', 'Elettromandrino', ...) della tabella
// CARATTERISTICHE TECNICHE, prima persi silenziosamente o appiattiti.
// Non tocca voci_opzionali (già risincronizzate da reseed-voci.mjs) né altri
// campi di modelli (prezzo_base, sottotitolo, ...).
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
    const { error: errUpdate } = await supabase
      .from('modelli')
      .update({
        descrizione_base: json.descrizione_base,
        macroistruzioni: json.macroistruzioni,
        specifiche_tecniche: json.specifiche_tecniche,
      })
      .eq('id', modello.id)
    if (errUpdate) {
      console.error(`ERRORE aggiornamento ${json.codice}: ${errUpdate.message}`)
      continue
    }
    console.log(`${json.codice}: descrizione_base, macroistruzioni e specifiche_tecniche aggiornati`)
  }
}

main()
