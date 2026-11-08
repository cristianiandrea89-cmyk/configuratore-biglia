// Aggiorna in modo INCREMENTALE l'archivio delle offerte Biglia storiche (pagina Storico + Suggerimenti)
// partendo dai file Word nelle cartelle OFFERTE <anno> su OneDrive.
//
// Cosa fa:
//  1. cerca in 04_Offerte/OFFERTE <anno> i file (.doc/.docx) il cui nome contiene un modello Biglia;
//  2. salta quelli già presenti in src/data/offerteStoriche.json (stesso id = nome file normalizzato,
//     o stessa offerta cliente|modello|numero);
//  3. converte in .docx i .doc nuovi (Word, via PowerShell) ed estrae cliente, modello, numero, data,
//     totale e testo con la stessa logica dello script iniziale (scripts/estrai-offerte-storiche.mjs);
//  4. riscrive offerteStoriche.json, offerteStoricheTesti.json e suggerimentiStorici.json.
//
// Uso:  node scripts/aggiorna-storico.mjs [--dry-run] [--anni 2026,2027] [--radice <cartella 04_Offerte>]
// Richiede Word installato (solo per convertire i .doc) e la cartella OneDrive sincronizzata.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const argVal = (nome, def) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : def
}
const RADICE = argVal(
  '--radice',
  'C:/Users/crist/OneDrive - F. Scassellati srl/F. Scassellati srl - Documenti/Commerciale/04_Offerte'
)
const ANNI = argVal('--anni', String(new Date().getFullYear())).split(',').map((a) => a.trim())

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const normalizza = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '')

// Stessi nomi canonici dello script iniziale.
const NOMI_CANONICI = {
  koheler: 'KOHELER', kohler: 'KOHELER', pmp: 'PMP SRL', pmpsrl: 'PMP SRL',
  mazzocchia: 'F.LLI MAZZOCCHIA', fllimazzocchia: 'F.LLI MAZZOCCHIA',
  petrolins: 'PETROL INSTR', petrolinstr: 'PETROL INSTR', steelpower: 'STEEL POWER',
  tecnologmecc: 'TECNOLOGIE MECCANICHE', tecnologiemeccaniche: 'TECNOLOGIE MECCANICHE',
}
const canonicalizza = (nome) => NOMI_CANONICI[normalizza(nome)] || nome

// --- catalogo modelli (per riconoscere il modello dal nome file) ---
const catalogo = {}
for (const f of readdirSync('scripts/import-output').filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join('scripts/import-output', f), 'utf-8'))
  catalogo[j.codice] = j
}
const codiciPerLunghezza = Object.keys(catalogo)
  .map((codice) => ({ codice, norm: normalizza(codice) }))
  .sort((a, b) => b.norm.length - a.norm.length)
const modelloDaTesto = (s) => codiciPerLunghezza.find((c) => normalizza(s).includes(c.norm))?.codice || null

// --- archivio esistente ---
const metadati = JSON.parse(readFileSync('src/data/offerteStoriche.json', 'utf-8'))
const testi = JSON.parse(readFileSync('src/data/offerteStoricheTesti.json', 'utf-8'))
const idEsistenti = new Set(metadati.map((o) => o.id))
const chiaveOfferta = (o) => `${normalizza(o.cliente)}|${o.modello}|${o.numero || normalizza(o.file_origine)}`
const chiaviEsistenti = new Set(metadati.map(chiaveOfferta))

// --- scansione cartelle ---
function* camminaFile(cartella, profondita = 0) {
  let voci
  try {
    voci = readdirSync(cartella, { withFileTypes: true })
  } catch {
    return
  }
  for (const v of voci) {
    const p = join(cartella, v.name)
    if (v.isDirectory()) {
      if (profondita < 3) yield* camminaFile(p, profondita + 1)
    } else yield p
  }
}

function clienteDaPercorso(percorso, nomeFile, annoCartella) {
  const parti = percorso.replace(/\\/g, '/').split('/')
  const i = parti.findIndex((p) => /^OFFERTE\s*\d{4}/i.test(p))
  let cliente = i >= 0 && i + 1 < parti.length - 1 ? parti[i + 1] : null
  if (!cliente) cliente = nomeFile.split(/[-(]/)[0].trim()
  return cliente.replace(/_/g, ' ').trim()
}

function numeroEData(nomeFile) {
  const numero = nomeFile.match(/n[._ ]?(\d{2,3})/i)?.[1] || null
  const dataMatch = nomeFile.match(/(\d{2})(\d{2})(\d{2}(?:\d{2})?)\D*\)?/g)
  let data = null
  if (dataMatch) {
    const ultimo = dataMatch[dataMatch.length - 1].match(/(\d{2})(\d{2})(\d{2}(?:\d{2})?)/)
    if (ultimo) {
      const [, gg, mm, yy] = ultimo
      const aaaa = yy.length === 2 ? '20' + yy : yy
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(gg) >= 1 && Number(gg) <= 31) data = `${aaaa}-${mm}-${gg}`
    }
  }
  const rev = nomeFile.match(/rev\.?\s*(\d)/i)?.[1] || null
  const confOrd = /conf\.?\s*ord|\bco\b|co-/i.test(nomeFile)
  return { numero, data, rev: rev ? Number(rev) : 0, confOrd }
}

const candidati = []
for (const anno of ANNI) {
  const cartellaAnno = join(RADICE, `OFFERTE ${anno}`)
  if (!existsSync(cartellaAnno)) {
    console.warn(`(cartella assente: ${cartellaAnno})`)
    continue
  }
  for (const p of camminaFile(cartellaAnno)) {
    const nome = basename(p)
    const est = extname(nome).toLowerCase()
    if (!['.doc', '.docx'].includes(est) || nome.startsWith('~$')) continue
    const senzaEst = nome.slice(0, -est.length)
    let modello = modelloDaTesto(senzaEst)
    // Nome file senza modello (es. "titanus-biglia (n.306-...)"): si cerca "biglia" e il modello si legge dal testo.
    if (!modello && !/biglia/i.test(senzaEst)) continue
    const id = normalizza(senzaEst)
    if (idEsistenti.has(id)) continue
    candidati.push({ percorso: p, nome: senzaEst, est, id, modello, anno })
  }
}

// un .docx e il suo .doc con lo stesso nome: si tiene il .docx
const perId = new Map()
for (const c of candidati) {
  const e = perId.get(c.id)
  if (!e || (e.est === '.doc' && c.est === '.docx')) perId.set(c.id, c)
}
const nuovi = [...perId.values()]
console.log(`File Biglia trovati in ${ANNI.join(', ')} non ancora in archivio: ${nuovi.length}`)
for (const c of nuovi) console.log('  -', c.nome + c.est)
if (DRY || nuovi.length === 0) {
  if (DRY) console.log('\n(dry-run: nessun file modificato)')
  process.exit(0)
}

// --- conversione dei .doc in .docx con Word ---
const cartellaTmp = join(tmpdir(), 'storico-biglia-' + Date.now())
mkdirSync(cartellaTmp, { recursive: true })
// Il comando va passato con -EncodedCommand: la policy di PowerShell su questo PC blocca i file .ps1.
function comandoConversione(src, dst) {
  const q = (t) => "'" + t.replace(/'/g, "''") + "'"
  const codice = [
    '$w = New-Object -ComObject Word.Application',
    '$w.Visible = $false; $w.DisplayAlerts = 0',
    // Word appena avviato può rifiutare le chiamate (RPC_E_CALL_REJECTED): breve attesa e qualche tentativo.
    'Start-Sleep 3',
    'for ($i = 1; $i -le 6; $i++) {',
    `  try { $d = $w.Documents.Open(${q(src)}, $false, $true); $d.SaveAs2(${q(dst)}, 16); $d.Close($false); break } catch { Start-Sleep 3 }`,
    '}',
    '$w.Quit()',
  ].join('\n')
  return Buffer.from(codice, 'utf16le').toString('base64')
}
function perLettura(c, i) {
  if (c.est === '.docx') return c.percorso
  const dst = join(cartellaTmp, `${String(i).padStart(3, '0')}.docx`)
  try {
    execFileSync('powershell', ['-NoProfile', '-EncodedCommand', comandoConversione(c.percorso, dst)], { timeout: 240000, stdio: 'ignore' })
  } catch (e) {
    console.warn(`  conversione fallita: ${c.nome} (${e.message.slice(0, 60)})`)
    return null
  }
  return existsSync(dst) ? dst : null
}

async function paragrafi(p) {
  const zip = await JSZip.loadAsync(readFileSync(p))
  const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'text/xml')
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
// Totale = importo con centesimi più grande del documento, soglia 50.000 (come nello script iniziale).
function totaleDa(righe) {
  const t = righe.join(' ')
  const importi = [...t.matchAll(/([\d]{1,3}(?:\.\d{3})+,\d{2})/g)].map((m) => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
  const max = importi.length ? Math.max(...importi) : null
  return max && max >= 50000 ? max : null
}

const aggiunte = []
let i = 0
for (const c of nuovi) {
  i++
  const lettura = perLettura(c, i)
  if (!lettura) continue
  let righe = []
  try {
    righe = await paragrafi(lettura)
  } catch {
    console.warn(`  file illeggibile: ${c.nome}`)
    continue
  }
  if (!c.modello) {
    // "Mod. B 620 YS" è la seconda riga del titolo macchina nelle offerte Biglia.
    const riga = righe.find((r) => /^Mod.s*S/i.test(r))
    c.modello = riga ? modelloDaTesto(riga) : null
    if (!c.modello) {
      console.warn(`  modello non riconosciuto, saltata: ${c.nome}`)
      continue
    }
  }
  const { numero, data, rev, confOrd } = numeroEData(c.nome)
  const o = {
    id: c.id,
    cliente: canonicalizza(clienteDaPercorso(c.percorso, c.nome, c.anno)),
    modello: c.modello,
    numero,
    data: data || `${c.anno}-01-01`,
    dataNota: data ? null : 'solo anno',
    totale: totaleDa(righe),
    file_origine: c.nome,
    _rev: rev,
    _confOrd: confOrd,
    _testo: righe,
  }
  const chiave = chiaveOfferta(o)
  if (chiaviEsistenti.has(chiave)) {
    console.log(`  già presente come offerta ${chiave}: ${c.nome}`)
    continue
  }
  // più file della stessa offerta (revisioni, copie): si tiene la migliore (conferma d'ordine, revisione più alta, totale maggiore)
  const precedente = aggiunte.findIndex((a) => chiaveOfferta(a) === chiave)
  if (precedente >= 0) {
    const a = aggiunte[precedente]
    const meglio = (o._confOrd ? 1 : 0) - (a._confOrd ? 1 : 0) || o._rev - a._rev || (o.totale || 0) - (a.totale || 0)
    if (meglio > 0) aggiunte[precedente] = o
    console.log(`  (stessa offerta di un altro file, tenuta la migliore) ${c.nome}`)
    continue
  }
  aggiunte.push(o)
  console.log(`  + ${o.data} ${o.cliente} ${o.modello} n.${o.numero ?? '—'} ${o.totale ? o.totale.toLocaleString('it-IT') + ' €' : 'n/d'}`)
}

for (const { _rev, _confOrd, _testo, ...meta } of aggiunte) {
  metadati.push(meta)
  testi[meta.id] = _testo
}
metadati.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
writeFileSync('src/data/offerteStoriche.json', JSON.stringify(metadati, null, 2), 'utf-8')
writeFileSync('src/data/offerteStoricheTesti.json', JSON.stringify(testi), 'utf-8')

// --- Suggerimenti: stessi criteri di scripts/analizza-offerte-storiche.mjs, calcolati dall'archivio ---
const risultati = {}
const visti = new Set()
for (const o of metadati) {
  const modello = catalogo[o.modello]
  if (!modello || !testi[o.id]) continue
  const nomePulito = (o.file_origine || '').replace(/^\d{3}-/, '')
  const numero = nomePulito.match(/n[._ ]?(\d{2,3})/i)
  const chiave = numero ? `${o.modello}|n${numero[1]}` : `${o.modello}|${normalizza(nomePulito)}`
  if (visti.has(chiave)) continue
  visti.add(chiave)
  const testoNorm = normalizza(testi[o.id].join(' '))
  const voci = modello.voci_opzionali
  const trovate = []
  for (const v of voci) {
    if (v.codice) {
      const cn = normalizza(v.codice)
      if (cn.length >= 6 && testoNorm.includes(cn)) trovate.push(v)
    } else {
      const dn = normalizza(v.descrizione).slice(0, 60)
      if (dn.length >= 25 && testoNorm.includes(dn)) trovate.push(v)
    }
  }
  if (trovate.length > voci.length * 0.5) {
    visti.delete(chiave)
    continue // copia del listino completo, non un'offerta
  }
  const r = (risultati[o.modello] ||= { totaleOfferte: 0, conteggi: new Map() })
  r.totaleOfferte++
  const vistiQui = new Set()
  for (const v of trovate) {
    const id = v.codice ? `cod:${v.codice}` : `desc:${normalizza(v.descrizione).slice(0, 60)}`
    if (vistiQui.has(id)) continue
    vistiQui.add(id)
    if (!r.conteggi.has(id)) r.conteggi.set(id, { voce: v, conteggio: 0 })
    r.conteggi.get(id).conteggio++
  }
}
const sugg = {}
for (const [codice, r] of Object.entries(risultati)) {
  sugg[codice] = {
    totaleOfferte: r.totaleOfferte,
    voci: [...r.conteggi.values()]
      .sort((a, b) => b.conteggio - a.conteggio)
      .slice(0, 10)
      .map(({ voce, conteggio }) => ({ codice: voce.codice || null, descNorm: normalizza(voce.descrizione).slice(0, 60), conteggio })),
  }
}
writeFileSync('src/data/suggerimentiStorici.json', JSON.stringify(sugg, null, 2), 'utf-8')
console.log(`\nArchivio: ${metadati.length} offerte (+${aggiunte.length}). Suggerimenti ricalcolati per ${Object.keys(sugg).length} modelli.`)
