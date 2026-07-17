// Rigenera src/data/noteVoci.json a partire dal campo 'note' di ogni JSON in
// scripts/import-output (prodotto da parse-master.mjs): note di contesto
// ('Kit di riduzione...', note incollate a un codice+descrizione, ecc.) da
// mostrare come riga nel configuratore sopra la voce a cui appartengono.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const cartella = 'scripts/import-output'
const output = {}

for (const f of readdirSync(cartella).filter((f) => f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(join(cartella, f), 'utf-8'))
  if (json.note?.length) output[json.codice] = json.note
}

writeFileSync('src/data/noteVoci.json', JSON.stringify(output, null, 2), 'utf-8')
const nModelli = Object.keys(output).length
const nNote = Object.values(output).reduce((sum, arr) => sum + arr.length, 0)
console.log(`${nModelli} modelli con note, ${nNote} note totali -> src/data/noteVoci.json`)
