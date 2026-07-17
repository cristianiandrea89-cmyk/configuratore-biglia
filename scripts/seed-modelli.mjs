// Carica in Supabase i JSON intermedi prodotti da parse-master.mjs (dopo revisione manuale).
// Uso: node scripts/seed-modelli.mjs <cartella-json>
//
// Richiede in .env (solo locale, mai committato):
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (Project Settings > API > service_role — bypassa RLS, usarla solo qui)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import 'dotenv/config'

const [, , cartella] = process.argv
if (!cartella) {
  console.error('Uso: node scripts/seed-modelli.mjs <cartella-json>')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Mancano VITE_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY nel file .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function seedModello(json) {
  if (!json.data_listino) {
    throw new Error(`${json.file_origine}: data_listino mancante, compilarla dopo la revisione manuale`)
  }
  if (json._non_classificato?.length) {
    console.warn(`${json.file_origine}: ${json._non_classificato.length} blocchi non classificati (verificare prima di importare)`)
  }

  // Disattiva l'eventuale versione precedente dello stesso modello.
  await supabase.from('modelli').update({ attivo: false }).eq('codice', json.codice).eq('attivo', true)

  const { data: modello, error: errModello } = await supabase
    .from('modelli')
    .insert({
      codice: json.codice,
      nome_commerciale: json.nome_commerciale,
      serie: json.serie,
      data_listino: json.data_listino,
      descrizione_base: json.descrizione_base,
      specifiche_tecniche: json.specifiche_tecniche,
      macroistruzioni: json.macroistruzioni,
      prezzo_base: json.prezzo_base,
      file_origine: json.file_origine,
      creato_da: 'import-script',
    })
    .select()
    .single()

  if (errModello) throw errModello

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
    const { error: errVoci } = await supabase.from('voci_opzionali').insert(voci)
    if (errVoci) throw errVoci
  }

  console.log(`OK: ${json.codice} (${voci.length} voci)`)
}

async function main() {
  const files = readdirSync(cartella).filter((f) => f.endsWith('.json'))
  console.log(`Trovati ${files.length} JSON in ${cartella}`)
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(cartella, f), 'utf-8'))
    try {
      await seedModello(json)
    } catch (err) {
      console.error(`FALLITO: ${f} -> ${err.message}`)
    }
  }
}

main()
