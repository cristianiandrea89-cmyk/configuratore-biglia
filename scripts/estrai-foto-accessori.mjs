// Script one-shot: estrae dai Master (convertiti in .docx con Word) le foto/disegni
// tecnici degli accessori a catalogo e le salva come asset statici dell'app,
// una per codice voce, così il Word generato può mostrarle accanto alla
// descrizione (come nelle offerte reali, dove il venditore le incollava a mano).
//
// I Master usano immagini VML legacy (<w:pict><v:shape type="#_x0000_t75">),
// non DrawingML: non sono ancorate in modo esplicito a un paragrafo, ma
// empiricamente compaiono nel flusso XML subito prima del testo del codice
// a cui si riferiscono (l'autore inseriva l'immagine e poi scriveva la riga
// codice+descrizione+prezzo). La corrispondenza viene quindi dedotta per
// prossimità e verificata contro i codici realmente presenti a DB per quel
// modello: se il codice più vicino non esiste nella tabella voci_opzionali,
// l'immagine viene scartata invece di essere assegnata a caso.
//
// Uso:
//   node scripts/estrai-foto-accessori.mjs <cartella-docx> <modelli.json> <voci.json> <cartella-output>
//
// modelli.json: [{ id, codice, nome_commerciale }] da `select id,codice,nome_commerciale from modelli`
// voci.json: [{ id, modello_id, codice, descrizione }] da voci_opzionali con codice non nullo

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'

const [, , docxDir, modelliPath, vociPath, outDir] = process.argv
if (!docxDir || !modelliPath || !vociPath || !outDir) {
  console.error('Uso: node estrai-foto-accessori.mjs <cartella-docx> <modelli.json> <voci.json> <cartella-output>')
  process.exit(1)
}

const modelli = JSON.parse(readFileSync(modelliPath, 'utf-8'))
const vociConCodice = JSON.parse(readFileSync(vociPath, 'utf-8'))

// Normalizza per confronto tollerante: il testo estratto dall'XML può avere
// spazi/tab dove il Master ha un trattino diverso o uno spazio in più.
function normalizza(s) {
  return s.replace(/\s+/g, '').toUpperCase()
}

const vociPerModello = new Map()
for (const v of vociConCodice) {
  if (!vociPerModello.has(v.modello_id)) vociPerModello.set(v.modello_id, new Map())
  vociPerModello.get(v.modello_id).set(normalizza(v.codice), v.codice)
}

// Nome file Master -> codice modello: i nomi non sono uniformi ('MASTER BMX
// 45Y2-01-2026-ITALIA', 'Master-B620-M-01-2026-ITALIA'), quindi si confronta
// il nome ripulito con il codice di ogni modello invece di provare a
// parsarlo con un'unica regex.
function trovaModello(nomeFile) {
  const pulito = normalizza(nomeFile.replace(/MASTER|\.docx$/gi, ''))
  let migliore = null
  for (const m of modelli) {
    const codiceNorm = normalizza(m.codice)
    if (pulito.includes(codiceNorm) && (!migliore || codiceNorm.length > normalizza(migliore.codice).length)) {
      migliore = m
    }
  }
  return migliore
}

// Codici di catalogo Biglia osservati: 'T016-00348', '0088-00043', '10.38.17.00'.
const CODICE_RE = /\b((?:[A-Z]{1,4})?\d{2,4}[.-]\d{2,6}(?:[.-]\d{2,6})*[A-Z]?)\b/g

const SHAPE_RE = /<v:shape[^>]*type="#_x0000_t75"[\s\S]*?<v:imagedata[^>]*r:id="(rId\d+)"[^/]*\/>[\s\S]*?<\/v:shape>/g
const FINESTRA_RICERCA = 1200 // caratteri XML dopo l'immagine in cui cercare il codice

let totFile = 0
let totImmagini = 0
let totAssegnate = 0
const riepilogo = []

const file = readdirSync(docxDir).filter((f) => f.endsWith('.docx'))
for (const nomeFile of file) {
  const modello = trovaModello(nomeFile)
  if (!modello) {
    console.warn(`[SALTATO] ${nomeFile}: nessun modello corrispondente per nome file`)
    continue
  }
  const codiciModello = vociPerModello.get(modello.id)
  if (!codiciModello) {
    console.warn(`[SALTATO] ${nomeFile}: modello ${modello.codice} non ha voci con codice a DB`)
    continue
  }

  totFile++
  const data = readFileSync(join(docxDir, nomeFile))
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file('word/document.xml').async('string')
  const relsXml = await zip.file('word/_rels/document.xml.rels').async('string')

  const relMap = {}
  for (const m of relsXml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="media\/([^"]+)"/g)) {
    relMap[m[1]] = m[2]
  }

  let assegnateFile = 0
  let scartateFile = 0
  const usati = new Set() // un solo file immagine per codice, la prima trovata

  for (const m of xml.matchAll(SHAPE_RE)) {
    totImmagini++
    const rId = m[1]
    const dopo = xml.slice(m.index + m[0].length, m.index + m[0].length + FINESTRA_RICERCA)
    const testoDopo = dopo.replace(/<[^>]+>/g, ' ')
    CODICE_RE.lastIndex = 0
    let trovato = null
    let match
    while ((match = CODICE_RE.exec(testoDopo))) {
      const norm = normalizza(match[1])
      if (codiciModello.has(norm)) {
        trovato = codiciModello.get(norm)
        break
      }
    }
    if (!trovato) {
      scartateFile++
      continue
    }
    if (usati.has(trovato)) continue // già trovata un'immagine per questo codice
    usati.add(trovato)

    const mediaFile = relMap[rId]
    if (!mediaFile) continue
    const buf = await zip.file(`word/media/${mediaFile}`).async('nodebuffer')
    const ext = mediaFile.split('.').pop().toLowerCase()
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') continue // ignora .emf/.wmf, non gestibili da docx.js

    const cartellaModello = join(outDir, modello.codice)
    mkdirSync(cartellaModello, { recursive: true })
    writeFileSync(join(cartellaModello, `${trovato}.${ext}`), buf)
    assegnateFile++
  }

  totAssegnate += assegnateFile
  riepilogo.push({ file: nomeFile, modello: modello.codice, assegnate: assegnateFile, scartate: scartateFile })
  console.log(`${nomeFile} -> ${modello.codice}: ${assegnateFile} assegnate, ${scartateFile} scartate (codice non riconosciuto)`)
}

console.log(`\nTotale: ${totFile} file processati, ${totImmagini} immagini trovate, ${totAssegnate} assegnate a un codice.`)
writeFileSync(join(outDir, '_riepilogo.json'), JSON.stringify(riepilogo, null, 2))
