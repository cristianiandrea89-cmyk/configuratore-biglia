// Analizza le offerte storiche Biglia (già convertite in .docx) e produce
// src/data/suggerimentiStorici.json: per ogni modello, quante volte ciascuna
// voce del catalogo attuale compare nelle offerte fatte in passato. Serve ad
// alimentare il box Suggerimenti da subito, senza aspettare che l'app accumuli
// il proprio storico.
//
// Uso: node scripts/analizza-offerte-storiche.mjs <cartella-docx>
//
// Matching volutamente prudente:
//  - voci di catalogo (accessori con codice): si cerca il codice nel testo,
//    identificatore stabile anche quando la descrizione è cambiata negli anni;
//  - optional descrittivi: prefisso normalizzato della descrizione (60 char),
//    tollera differenze in coda ma non riscritture profonde — un'offerta
//    vecchia con testo diverso semplicemente non conta, nessun falso positivo.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const cartellaDocx = process.argv[2]
if (!cartellaDocx) {
  console.error('Uso: node scripts/analizza-offerte-storiche.mjs <cartella-docx>')
  process.exit(1)
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function normalizza(testo) {
  return testo.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function estraiTesto(docxPath) {
  const buf = readFileSync(docxPath)
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const ts = doc.getElementsByTagNameNS(W_NS, 't')
  let testo = ''
  for (let i = 0; i < ts.length; i++) testo += ts[i].textContent + ' '
  return testo
}

// Catalogo attuale: JSON già estratti dai Master 2026.
const CARTELLA_CATALOGO = 'scripts/import-output'
const catalogo = {}
for (const f of readdirSync(CARTELLA_CATALOGO).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join(CARTELLA_CATALOGO, f), 'utf-8'))
  catalogo[j.codice] = j
}

// Codici normalizzati (senza trattini) per riconoscere il modello nel nome
// file: i file usano grafie varie ('B750 YS', 'B620Y', 'BMX 45Y2').
// Ordinati dal più lungo così 'B750YS' vince su 'B750Y' che vince su 'B750'.
const codiciPerLunghezza = Object.keys(catalogo)
  .map((codice) => ({ codice, norm: normalizza(codice) }))
  .sort((a, b) => b.norm.length - a.norm.length)

function modelloDaNomeFile(nomeFile) {
  const norm = normalizza(nomeFile)
  const trovato = codiciPerLunghezza.find((c) => norm.includes(c.norm))
  return trovato ? trovato.codice : null
}

// Chiave di dedup per rivedute/copie dello stesso documento: numero offerta
// se presente nel nome file, altrimenti il nome file normalizzato (senza il
// progressivo che ho anteposto in conversione).
function chiaveDedup(nomeFile, codiceModello) {
  const senzaProgressivo = nomeFile.replace(/^\d{3}-/, '')
  const numero = senzaProgressivo.match(/n[._ ]?(\d{2,3})/i)
  if (numero) return `${codiceModello}|n${numero[1]}`
  return `${codiceModello}|${normalizza(senzaProgressivo)}`
}

const files = readdirSync(cartellaDocx).filter((f) => f.endsWith('.docx'))
const visti = new Set()
const risultati = {} // codice -> { totaleOfferte, conteggi: Map<idVoce, {voce, conteggio}> }
let saltatiSenzaModello = 0
let saltatiDuplicati = 0
let saltatiListinoCompleto = 0

for (const f of files) {
  const codiceModello = modelloDaNomeFile(f)
  if (!codiceModello || !catalogo[codiceModello]) {
    saltatiSenzaModello++
    continue
  }
  const chiave = chiaveDedup(f, codiceModello)
  if (visti.has(chiave)) {
    saltatiDuplicati++
    continue
  }
  visti.add(chiave)

  let testoNorm
  try {
    testoNorm = normalizza(await estraiTesto(join(cartellaDocx, f)))
  } catch (e) {
    console.warn(`ERRORE lettura ${f}: ${e.message}`)
    continue
  }

  const voci = catalogo[codiceModello].voci_opzionali
  const trovate = []
  for (const v of voci) {
    if (v.codice) {
      const codNorm = normalizza(v.codice)
      if (codNorm.length >= 6 && testoNorm.includes(codNorm)) trovate.push(v)
    } else {
      const descNorm = normalizza(v.descrizione).slice(0, 60)
      if (descNorm.length >= 25 && testoNorm.includes(descNorm)) trovate.push(v)
    }
  }

  // Un documento che contiene più di metà del catalogo non è un'offerta
  // personalizzata: è quasi certamente una copia del Master/listino completo
  // finita nella cartella offerte, e conteggiarla gonfierebbe tutto.
  if (trovate.length > voci.length * 0.5) {
    saltatiListinoCompleto++
    visti.delete(chiave)
    continue
  }

  if (!risultati[codiceModello]) risultati[codiceModello] = { totaleOfferte: 0, conteggi: new Map() }
  const r = risultati[codiceModello]
  r.totaleOfferte++
  // Il catalogo può avere più righe con lo stesso codice (varianti/aggiunte
  // dello stesso accessorio, es. '10.57.92.00' su 'Supporto a coda di
  // rondine' e '+ Supporto a coda di rondine'): va contata una sola volta
  // per offerta, altrimenti il conteggio supera il totale offerte.
  const idVistiInQuestaOfferta = new Set()
  for (const v of trovate) {
    const id = v.codice ? `cod:${v.codice}` : `desc:${normalizza(v.descrizione).slice(0, 60)}`
    if (idVistiInQuestaOfferta.has(id)) continue
    idVistiInQuestaOfferta.add(id)
    if (!r.conteggi.has(id)) r.conteggi.set(id, { voce: v, conteggio: 0 })
    r.conteggi.get(id).conteggio++
  }
}

const output = {}
for (const [codice, r] of Object.entries(risultati)) {
  output[codice] = {
    totaleOfferte: r.totaleOfferte,
    voci: [...r.conteggi.values()]
      .sort((a, b) => b.conteggio - a.conteggio)
      .slice(0, 10)
      .map(({ voce, conteggio }) => ({
        codice: voce.codice || null,
        descNorm: normalizza(voce.descrizione).slice(0, 60),
        conteggio,
      })),
  }
}

writeFileSync('src/data/suggerimentiStorici.json', JSON.stringify(output, null, 2), 'utf-8')

console.log(`File analizzati: ${files.length}`)
console.log(`Saltati (modello non riconosciuto): ${saltatiSenzaModello}`)
console.log(`Saltati (duplicati/revisioni): ${saltatiDuplicati}`)
console.log(`Saltati (listino completo, non offerta): ${saltatiListinoCompleto}`)
console.log('--- offerte valide per modello ---')
Object.entries(output)
  .sort()
  .forEach(([codice, r]) => console.log(codice.padEnd(10), r.totaleOfferte, 'offerte,', r.voci.length, 'voci suggerite'))
