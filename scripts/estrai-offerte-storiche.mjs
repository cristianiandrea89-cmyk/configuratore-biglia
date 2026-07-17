// Estrae i metadati (cliente, modello, numero, data, totale) dalle offerte
// Biglia storiche già convertite in .docx, e produce
// src/data/offerteStoriche.json per popolare la pagina Storico con l'archivio
// reale — senza inserirle nel DB (sono record storici di sola lettura).
//
// Uso: node scripts/estrai-offerte-storiche.mjs <cartella-docx> <lista-path.txt>
//
// La lista è il file originale usato per la conversione: l'ordine coincide con
// il progressivo NNN- anteposto ai .docx, così si risale al percorso originale
// (da cui si ricava il cliente = cartella dopo 'OFFERTE 20XX').
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const [, , cartellaDocx, listaPath] = process.argv
if (!cartellaDocx || !listaPath) {
  console.error('Uso: node scripts/estrai-offerte-storiche.mjs <cartella-docx> <lista.txt>')
  process.exit(1)
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function normalizza(t) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Unificazione nomi cliente confermata con l'utente: chiave = nome
// normalizzato, valore = nome canonico da mostrare. Le grafie diverse dello
// stesso cliente (typo, abbreviazioni, & vs spazio) confluiscono in un unico
// nome. I casi dubbi (TECNOLCHI, CMG/CMS, TEC.MECC PROJECT) restano separati
// per scelta esplicita.
const NOMI_CANONICI = {
  koheler: 'KOHELER',
  kohler: 'KOHELER',
  pmp: 'PMP SRL',
  pmpsrl: 'PMP SRL',
  mazzocchia: 'F.LLI MAZZOCCHIA',
  fllimazzocchia: 'F.LLI MAZZOCCHIA',
  petrolins: 'PETROL INSTR',
  petrolinstr: 'PETROL INSTR',
  steelpower: 'STEEL POWER', // 'STEEL & POWER' e 'STEEL POWER' hanno lo stesso normalizzato
  tecnologmecc: 'TECNOLOGIE MECCANICHE',
  tecnologiemeccaniche: 'TECNOLOGIE MECCANICHE',
}

function canonicalizzaCliente(nome) {
  return NOMI_CANONICI[normalizza(nome)] || nome
}

// --- catalogo per riconoscere il modello dal nome file ---
const catalogo = {}
for (const f of readdirSync('scripts/import-output').filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join('scripts/import-output', f), 'utf-8'))
  catalogo[j.codice] = j
}
const codiciPerLunghezza = Object.keys(catalogo)
  .map((codice) => ({ codice, norm: normalizza(codice) }))
  .sort((a, b) => b.norm.length - a.norm.length)

function modelloDaTesto(s) {
  const norm = normalizza(s)
  const trovato = codiciPerLunghezza.find((c) => norm.includes(c.norm))
  return trovato ? trovato.codice : null
}

// --- percorsi originali indicizzati come in conversione (1-based) ---
const righeLista = readFileSync(listaPath, 'utf-8')
  .split('\n')
  .map((r) => r.trim())
  .filter(Boolean)
  .map((p) => {
    const m = p.match(/^\/([a-z])\/(.*)$/)
    return m ? m[1].toUpperCase() + ':/' + m[2] : p
  })

function pathPerIndice(i) {
  return righeLista[i - 1] || null
}

// Cliente = cartella subito dopo 'OFFERTE 20XX' se non è il file stesso,
// altrimenti il prefisso del nome file (prima di '-' o '(').
function clienteEAnno(pathOriginale, nomeFile) {
  let cliente = null
  let anno = null
  if (pathOriginale) {
    const parti = pathOriginale.split('/')
    const idxOfferte = parti.findIndex((p) => /^OFFERTE\s*\d{4}/i.test(p))
    if (idxOfferte >= 0) {
      anno = parti[idxOfferte].match(/(\d{4})/)?.[1] || null
      // segmento successivo, se non è il file (ultimo segmento)
      if (idxOfferte + 1 < parti.length - 1) cliente = parti[idxOfferte + 1]
    }
  }
  if (!cliente) cliente = nomeFile.split(/[-(]/)[0].trim()
  cliente = cliente.replace(/_/g, ' ').trim()
  return { cliente, anno }
}

// Numero offerta e data dal nome file: '(n.140-25072014)', '(co-190614)',
// '(conf.ord.050626)', '(n.146-181016)', 'rev.1' ecc.
function numeroEData(nomeFile, annoCartella) {
  const numero = nomeFile.match(/n[._ ]?(\d{2,3})/i)?.[1] || null
  const confOrd = /conf\.?\s*ord|\bco\b|co-/i.test(nomeFile)
  // gruppo di 6 o 8 cifre = data DDMMYY(YY)
  const dataMatch = nomeFile.match(/(\d{2})(\d{2})(\d{2}(?:\d{2})?)\D*\)?/g)
  let data = null
  if (dataMatch) {
    const ultimo = dataMatch[dataMatch.length - 1].match(/(\d{2})(\d{2})(\d{2}(?:\d{2})?)/)
    if (ultimo) {
      const gg = ultimo[1]
      const mm = ultimo[2]
      let aaaa = ultimo[3]
      if (aaaa.length === 2) aaaa = '20' + aaaa
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(gg) >= 1 && Number(gg) <= 31) {
        data = `${aaaa}-${mm}-${gg}`
      }
    }
  }
  const rev = nomeFile.match(/rev\.?\s*(\d)/i)?.[1] || null
  return { numero, confOrd, data, rev }
}

async function testo(p) {
  const zip = await JSZip.loadAsync(readFileSync(p))
  const xml = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const ts = doc.getElementsByTagNameNS(W_NS, 't')
  let t = ''
  for (let i = 0; i < ts.length; i++) t += ts[i].textContent
  return t
}

// Testo per paragrafi (per la scheda in-app): ogni <w:p> diventa una riga
// leggibile, invece del testo tutto attaccato usato per la ricerca importi.
async function paragrafi(p) {
  const zip = await JSZip.loadAsync(readFileSync(p))
  const xml = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const ps = doc.getElementsByTagNameNS(W_NS, 'p')
  const righe = []
  for (let i = 0; i < ps.length; i++) {
    const ts = ps[i].getElementsByTagNameNS(W_NS, 't')
    let r = ''
    for (let j = 0; j < ts.length; j++) r += ts[j].textContent
    r = r.trim()
    if (r) righe.push(r)
  }
  return righe
}

function euroToNum(s) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

// Totale = importo con centesimi più grande nel documento (il prezzo macchina
// domina su corso/accessori); soglia 50.000 per escludere doc senza totale.
function estraiTotale(t) {
  const importi = [...t.matchAll(/([\d]{1,3}(?:\.\d{3})+,\d{2})/g)].map((m) => euroToNum(m[1]))
  const max = importi.length ? Math.max(...importi) : null
  return max && max >= 50000 ? max : null
}

const files = readdirSync(cartellaDocx)
  .filter((f) => f.endsWith('.docx'))
  .sort()

const grezze = []
for (const f of files) {
  const indice = Number(f.match(/^(\d+)-/)?.[1])
  const pathOrig = Number.isFinite(indice) ? pathPerIndice(indice) : null
  const nomeSenzaProg = f.replace(/^\d+-/, '').replace(/\.docx$/, '')
  const modello = modelloDaTesto(nomeSenzaProg)
  if (!modello) continue
  const { cliente, anno } = clienteEAnno(pathOrig, nomeSenzaProg)
  const { numero, confOrd, data, rev } = numeroEData(nomeSenzaProg, anno)
  let totale = null
  let righeTesto = []
  try {
    totale = estraiTotale(await testo(join(cartellaDocx, f)))
    righeTesto = await paragrafi(join(cartellaDocx, f))
  } catch {
    /* file illeggibile: totale e testo restano vuoti */
  }
  grezze.push({
    id: normalizza(nomeSenzaProg),
    cliente: canonicalizzaCliente(cliente),
    modello,
    numero,
    confOrd,
    data: data || (anno ? `${anno}-01-01` : null),
    dataNota: !data && anno ? 'solo anno' : null,
    rev: rev ? Number(rev) : 0,
    totale,
    file_origine: nomeSenzaProg,
    _testo: righeTesto,
  })
}

// Dedup: stessa offerta (cliente|modello|numero) in più copie/revisioni ->
// tieni la revisione più alta; le conferme d'ordine hanno priorità sulle
// offerte con lo stesso numero (rappresentano lo stato finale).
const perChiave = new Map()
for (const o of grezze) {
  const chiave = `${normalizza(o.cliente)}|${o.modello}|${o.numero || normalizza(o.file_origine)}`
  const esistente = perChiave.get(chiave)
  if (!esistente) {
    perChiave.set(chiave, o)
    continue
  }
  const meglio =
    (o.confOrd ? 1 : 0) - (esistente.confOrd ? 1 : 0) || o.rev - esistente.rev || (o.totale || 0) - (esistente.totale || 0)
  if (meglio > 0) perChiave.set(chiave, o)
}

const finali = [...perChiave.values()]
  .map(({ confOrd, rev, ...resto }) => resto)
  .sort((a, b) => (b.data || '').localeCompare(a.data || ''))

// Due file separati: i metadati (leggeri) alimentano la tabella Storico ed
// entrano nel bundle; i testi (pesanti) stanno a parte e la scheda di
// dettaglio li carica solo quando serve (import dinamico), così non
// appesantiscono chi non li apre.
const testiPerId = {}
const metadati = finali.map(({ _testo, ...resto }) => {
  testiPerId[resto.id] = _testo
  return resto
})

writeFileSync('src/data/offerteStoriche.json', JSON.stringify(metadati, null, 2), 'utf-8')
writeFileSync('src/data/offerteStoricheTesti.json', JSON.stringify(testiPerId), 'utf-8')

console.log(`File con modello riconosciuto: ${grezze.length}`)
console.log(`Offerte dopo dedup: ${finali.length}`)
console.log(`Senza totale: ${finali.filter((o) => !o.totale).length}`)
console.log(`Solo anno (data incerta): ${finali.filter((o) => o.dataNota).length}`)
console.log('\nEsempi:')
finali.slice(0, 12).forEach((o) =>
  console.log(
    (o.data || '?').padEnd(11),
    (o.cliente || '?').slice(0, 20).padEnd(21),
    o.modello.padEnd(9),
    (o.numero ? 'n.' + o.numero : '—').padEnd(7),
    o.totale ? o.totale.toLocaleString('it-IT') + ' €' : 'n/d'
  )
)
