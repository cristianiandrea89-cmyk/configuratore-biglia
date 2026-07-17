// Parsing di un Master-*.docx (Biglia) in una struttura dati intermedia JSON.
// Uso: node scripts/parse-master.mjs <input.docx> <output.json>
//
// Un Master contiene, in ordine:
//   1. prosa dotazione standard
//   2. "CARATTERISTICHE TECNICHE" -> coppie etichetta/valore (tab-separated)
//   3. "ELENCO MACROISTRUZIONI..." -> blocco di testo/lista
//   4. riga "PREZZO DI N. 1 TORNIO ... Euro X" -> prezzo base
//   5. voci optional: "descrizione ... € prezzo" (anche multi-frase)
//   6. tabelle a catalogo (accessori): codice | descrizione | prezzo, con un
//      titolo-gruppo nel paragrafo subito sopra la tabella
//
// Questo script produce un JSON intermedio da rivedere a mano (specialmente
// il campo _non_classificato) prima di importarlo in Supabase.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Uso: node scripts/parse-master.mjs <input.docx> <output.json>')
  process.exit(1)
}

const PREZZO_BASE_RE = /PREZZO\s+DI\s+N\.?\s*1\s+TORNIO.*?(?:Euro|€)\s*([\d.,]+)/is
const SPECIFICHE_HEADER_RE = /CARATTERISTICHE\s+TECNICHE/i
const MACRO_HEADER_RE = /ELENCO\s+MACROISTRUZIONI/i
// Il paragrafo 'CONTROLLO FANUC/MITSUBISHI ...' segna la fine vera della
// tabella CARATTERISTICHE TECNICHE: da qui in poi è prosa sul pannello CNC,
// non più righe etichetta/valore (va a finire in 'macroistruzioni', non in
// 'specifiche_tecniche', altrimenti verrebbe scambiata per righe di tabella).
const CONTROLLO_HEADER_RE = /^CONTROLLO\s+(FANUC|MITSUBISHI|SIEMENS|HEIDENHAIN)/i
// Un paragrafo può contenere più voci con prezzo (nessuna interruzione di
// paragrafo tra loro nel documento originale), quindi si scansiona l'intero
// blocco concatenato cercando ogni occorrenza di "descrizione ... € prezzo".
const VOCE_PREZZO_RE = /([\s\S]+?)€\s*([\d.,]+)(?=\s|$)/g
const SUPPLEMENTO_SUFFIX_RE = /SUPPLEMENTO\s*$/i
// Voci di catalogo: iniziano con un codice tipo 'T016-00348', '10.38.17.00', '0088-00043'.
const CODICE_PREFIX_RE = /^([A-Z]{0,4}\d[^\s]{1,20})\s+(.+)$/s
// Frase di cortesia standard della lettera (non è composizione tecnica): va esclusa
// dalla descrizione_base, così non appare né in UI né duplicata nel PDF (dove viene
// già mostrata separatamente come apertura del documento).
const FRASE_CORTESIA_RE = /Vi ringraziamo per la fiducia|^Spett\.le$/i

function euroToNumber(str) {
  // Formato italiano: '169.500,00' -> 169500.00
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

function guessCodiceModello(filename) {
  // 'Master-B750M-01-2026-ITALIA' / 'MASTER BMX 45Y2-01-2026-ITALIA' -> 'B750M' / 'BMX45Y2'
  const base = basename(filename, '.docx').replace(/^master[- ]?/i, '')
  const withoutDate = base.replace(/-\d{2}-\d{4}-ITALIA$/i, '')
  return withoutDate.replace(/\s+/g, '').toUpperCase()
}

function guessSerie(codice) {
  const m = codice.match(/^(B\d{3,4}|BMX)/)
  return m ? m[1] : null
}

function guessDataListino(filename) {
  // 'Master-B750M-01-2026-ITALIA.docx' -> '2026-01-01'
  const m = basename(filename).match(/-(\d{2})-(\d{4})-ITALIA/i)
  return m ? `${m[2]}-${m[1]}-01` : null
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

// Testo di un paragrafo, escludendo eventuali caselle di testo annidate
// (w:txbxContent): quelle vengono estratte ed inserite a parte da
// estraiParagrafi, altrimenti finirebbero duplicate (una volta qui, una
// volta come paragrafo a sé).
function testoParagrafoPrincipale(p) {
  let testo = ''
  function cammina(nodo) {
    for (let i = 0; i < nodo.childNodes.length; i++) {
      const figlio = nodo.childNodes[i]
      if (figlio.localName === 'txbxContent') continue
      if (figlio.localName === 't') testo += figlio.textContent
      else if (figlio.localName === 'tab') testo += '\t'
      else if (figlio.localName === 'br' || figlio.localName === 'cr') testo += ' '
      else if (figlio.childNodes?.length) cammina(figlio)
    }
  }
  cammina(p)
  return testo
}

async function estraiParagrafi(docxPath) {
  // Non si usa mammoth: converte in HTML e scarta silenziosamente il testo
  // dentro le caselle di testo (w:txbxContent), che nei Master Biglia
  // contengono a volte i titoli di sezione (es. "ATTREZZI di PRESA MANDRINO
  // ..."). Si legge quindi direttamente l'XML per non perderli.
  const buf = readFileSync(docxPath)
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0]
  const paragrafiTop = []
  for (let i = 0; i < body.childNodes.length; i++) {
    if (body.childNodes[i].localName === 'p') paragrafiTop.push(body.childNodes[i])
  }

  // Per ogni casella di testo, trova a quale paragrafo di primo livello è
  // ancorata (il suo antenato il cui genitore è <w:body>), per inserirla
  // nella posizione giusta nel flusso.
  const testoBoxPerIndice = new Map()
  const boxes = doc.getElementsByTagNameNS(W_NS, 'txbxContent')
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    let nodo = box
    while (nodo.parentNode && nodo.parentNode !== body) nodo = nodo.parentNode
    const indiceAncora = paragrafiTop.indexOf(nodo)
    if (indiceAncora === -1) continue
    const testoBox = testoParagrafoPrincipale(box).trim()
    if (!testoBox) continue
    if (!testoBoxPerIndice.has(indiceAncora)) testoBoxPerIndice.set(indiceAncora, [])
    testoBoxPerIndice.get(indiceAncora).push(testoBox)
  }

  const paragrafi = []
  paragrafiTop.forEach((p, i) => {
    const testo = testoParagrafoPrincipale(p).trim()
    if (testo) paragrafi.push(testo)
    for (const testoBox of testoBoxPerIndice.get(i) || []) paragrafi.push(testoBox)
  })
  return paragrafi
}

async function estraiTabelle(docxPath) {
  // Legge word/document.xml direttamente per estrarre le tabelle (<w:tbl>),
  // così codice/descrizione/prezzo restano allineati per colonna.
  const buf = readFileSync(docxPath)
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const tabelle = []

  const tbls = doc.getElementsByTagNameNS(W_NS, 'tbl')
  for (let i = 0; i < tbls.length; i++) {
    const tbl = tbls[i]
    const righe = []
    const trs = tbl.getElementsByTagNameNS(W_NS, 'tr')
    for (let r = 0; r < trs.length; r++) {
      const tcs = trs[r].getElementsByTagNameNS(W_NS, 'tc')
      const celle = []
      for (let c = 0; c < tcs.length; c++) {
        const ts = tcs[c].getElementsByTagNameNS(W_NS, 't')
        let testo = ''
        for (let t = 0; t < ts.length; t++) testo += ts[t].textContent
        celle.push(testo.trim())
      }
      if (celle.some((c) => c)) righe.push(celle)
    }
    if (righe.length) tabelle.push(righe)
  }
  return tabelle
}

const GRUPPO_KEYWORDS = [
  [/AUTOCENTRANTE/i, 'Extra dotazione'],
  [/PORTAPINZA/i, 'Extra dotazione'],
  [/PINZA\s+ER/i, 'Extra dotazione'],
  [/MANDRINETT/i, 'Mandrinetti motorizzati'],
  [/PORTABARENO/i, 'Extra dotazione'],
  [/PORTAUTENSILE/i, 'Extra dotazione'],
  [/BOCCOLA/i, 'Extra dotazione'],
  [/ADATTATORE|WTO/i, 'Adattatori'],
  [/CHIAVE/i, 'Chiavi di bloccaggio'],
  [/TAPPO/i, 'Extra dotazione'],
]

// Fallback quando la descrizione non contiene una parola chiave riconoscibile
// (es. varianti "MT - ..." dei mandrinetti T134, o adattatori T002 senza la
// parola "adattatore" nel testo).
const GRUPPO_PREFISSO_CODICE = {
  T134: 'Mandrinetti motorizzati',
  T002: 'Adattatori',
  T012: 'Chiavi di bloccaggio',
  T054: 'Chiavi di bloccaggio',
  T016: 'Extra dotazione',
  T181: 'Extra dotazione',
  T170: 'Extra dotazione',
}

function guessGruppo(descrizione, codice) {
  // Il prefisso codice ha la precedenza sulle parole chiave: è specifico di
  // una famiglia di catalogo, mentre una parola chiave come 'pinza ER' compare
  // anche nella descrizione di mandrinetti (T134) che non sono affatto
  // pinze/portapinze, e finirebbe altrimenti classificata come 'Extra
  // dotazione' invece che 'Mandrinetti motorizzati'.
  const prefisso = Object.keys(GRUPPO_PREFISSO_CODICE).find((p) => codice?.startsWith(p))
  if (prefisso) return GRUPPO_PREFISSO_CODICE[prefisso]
  const trovato = GRUPPO_KEYWORDS.find(([re]) => re.test(descrizione))
  // Nessuna parola chiave o prefisso riconosciuto: nel Master queste righe
  // ricadono comunque nella sezione finale "EXTRADOTAZIONE per TORRETTA...".
  return trovato ? trovato[1] : 'Extra dotazione'
}

// Codice di catalogo isolato (senza descrizione dopo), per riconoscerlo
// incollato in coda a una nota di contesto (vedi sotto): 'T134-00026A',
// '10.57.60.00', '0063-00003'.
const CODICE_TOKEN_RE = /((?:[A-Z]{1,4})?\d{2,4}-\d{3,6}[A-Z]?|\d{1,2}(?:\.\d{2,3}){2,4})\s*$/

function classificaVoce(descrizioneGrezza) {
  // Distingue un optional descrittivo (prosa) da una voce di catalogo
  // (codice + descrizione breve, es. 'T016-00348  Autocentrante...').
  const codiceMatch = descrizioneGrezza.match(CODICE_PREFIX_RE)
  if (codiceMatch) {
    const descrizione = codiceMatch[2].trim()
    return { categoria: 'accessori_catalogo', gruppo: guessGruppo(descrizione, codiceMatch[1]), codice: codiceMatch[1], descrizione }
  }
  // Alcune note di contesto (es. 'Gli attacchi cilindrici, vanno gestiti con
  // gli adattatori QF', 'I mandrinetti con refrigerante interno vanno...')
  // sono incollate SENZA interruzione di paragrafo (un a-capo software nel
  // Word originale, letto come spazio da estraiParagrafi) davanti al vero
  // codice+descrizione di catalogo che segue, separato da un tab
  // ('...QF T134-00026A\tMT - moltiplic...'): il codice non è quindi in
  // testa alla stringa (dove lo cerca CODICE_PREFIX_RE) ma appena prima
  // dell'unico tab. Si applica solo con un tab solo: più di uno significa
  // un blocco più complesso (es. elenco di più voci in un unico paragrafo),
  // da lasciare non classificato piuttosto che spezzarlo a caso.
  const tab = descrizioneGrezza.indexOf('\t')
  if (tab !== -1 && descrizioneGrezza.indexOf('\t', tab + 1) === -1) {
    const pre = descrizioneGrezza.slice(0, tab)
    const post = descrizioneGrezza.slice(tab + 1).trim()
    const tokenMatch = pre.match(CODICE_TOKEN_RE)
    if (tokenMatch) {
      const codice = tokenMatch[1]
      const notaInline = pre.slice(0, tokenMatch.index).trim() || null
      return { categoria: 'accessori_catalogo', gruppo: guessGruppo(post, codice), codice, descrizione: post, _notaInline: notaInline }
    }
  }
  return { categoria: 'optional_macchina', gruppo: null, codice: null, descrizione: descrizioneGrezza.trim() }
}

// Intestazioni reali del Master (es. 'ATTREZZI di PRESA MANDRINO ASA 8” foro 82
// filetto M90x1,5') che vanno mantenute testuali come 'gruppo' invece di essere
// sostituite da un nome generico, perché distinguono attrezzature per mandrini
// di misura diversa (importante per la scelta, non solo cosmetico).
const ATTREZZI_HEADER_RE = /ATTREZZI\s+di\s+PRESA\s+(MANDRINO|CONTROTESTA)[^\n]*/i
const ATTREZZI_HEADER_PREFIX_RE = /^ATTREZZI\s+di\s+PRESA\s+(MANDRINO|CONTROTESTA)[^\n]*/i
// Titoli di sezione trovati nelle text-box del Master (catalogati su tutti i 26
// file) che vanno tolti dal testo di ricerca prezzi perché coprono PIÙ voci
// successive (non sono descrizione di una singola voce, a differenza di
// 'VERSIONI CON MANDRINO ...' o 'ATTREZZI di PRESA ...' che restano). Match
// case-sensitive sul MAIUSCOLO usato nei titoli, per non confonderli con una
// vera descrizione voce che inizia per caso con le stesse parole.
const SEZIONE_ESCLUSA_RE =
  /^(ACCESSORI OPZIONALI|EXTRADOTAZIONE|MANDRINETTI\s|PORTABARENO\b|PORTAUTENSILI\b|ADATTATORI\s+WTO|Chiavi\s+di\s+BLOCCAGGIO|ATTENZIONE:)/

function segmentaOptional(paragrafi, startIdx, endIdx) {
  const sottoParagrafi = paragrafi.slice(startIdx, endIdx)
  // Le intestazioni (es. 'ATTREZZI di PRESA MANDRINO ...'), i titoli di sezione
  // e le note 'N.B. ...' non hanno un prezzo proprio: se restassero nel testo
  // si incollerebbero come prefisso alla voce successiva, rovinandone il
  // riconoscimento del codice. Si tolgono dal testo di ricerca prezzi (quelle
  // 'ATTREZZI di PRESA ...' restano comunque salvate a parte in 'intestazioni').
  //
  // Importante: gli offset per 'intestazioni' vanno calcolati sulla lunghezza
  // REALE di ogni paragrafo nel testo unito (dopo aver svuotato titoli/note),
  // altrimenti la posizione registrata di un'intestazione risulta più avanti
  // di dove in realtà cade nel testo di ricerca, e le prime voci dopo di essa
  // non gliela vedono associata.
  const NB_NOTE_RE = /^N\.B\.[:.]?\s/i
  // 'Kit di riduzione sui/sul ... per pinza:' introduce un elenco puntato di
  // voci (ognuna già con il proprio codice+prezzo): è una nota, non fa parte
  // della prima voce che segue. Stesso discorso per 'Versione RADIALE/ASSIALE
  // H70/.../per CREATORE/per POLIGONATURA:' (sotto-titoli dentro Mandrinetti),
  // 'Uscita refrigerante...' e 'ATTENZIONE:' (note isolate).
  const NOTA_ISOLATA_RE =
    /^(Kit\s+di\s+riduzione\s+su|Versione\s|Uscita\s+refrigerante|Su\s+B\d{3,4}\b|con\s+adduzione\s+refrigerante|Saranno\s+sostituiti:|Rotazione\s+in\s+M\d|\+\s*Portautensile|solo\s+su\s+portabareno)/i
  // Alcune di queste note sono in realtà intestazioni di contesto utili da
  // MOSTRARE come riga (non solo da togliere dal testo prezzi): la
  // 'Kit di riduzione sui ... portapinza per pinza:' introduce i kit T012 che
  // seguono, 'Versione RADIALE/ASSIALE H70/.../per CREATORE:' introduce un
  // sottogruppo di mandrinetti T134, 'Su B620 ...' è un'avvertenza specifica
  // di modello sulla voce che segue. Vengono comunque svuotate qui sopra per
  // non incollarsi alla voce dopo, ma catturate a parte per riproporle nel
  // configuratore.
  const NOTA_VISIBILE_RE = /^(Kit\s+di\s+riduzione\s+su|Versione\s|Su\s+B\d{3,4}\b)/i
  // Una voce di catalogo segnata 'Non disp.' invece che con un prezzo (es.
  // 'T054-00188  Chiave CH24 per ghiera ER16 standard  Non disp.'): non ha
  // prezzo proprio, quindi non passa mai da VOCE_PREZZO_RE e si incollerebbe
  // come farcitura alla prima voce successiva CON prezzo. Si toglie dal testo
  // di ricerca prezzi e si mostra come nota (il codice esiste ma non è
  // disponibile) sopra quella voce successiva.
  const NON_DISPONIBILE_RE = /^([A-Za-z]{0,4}\d[^\s\t]{1,20})\t(.+?)\tNon\s+disp\.?\s*$/i
  const testoParagrafi = sottoParagrafi.map((p) =>
    ATTREZZI_HEADER_RE.test(p) || NB_NOTE_RE.test(p) || NOTA_ISOLATA_RE.test(p) || SEZIONE_ESCLUSA_RE.test(p) || NON_DISPONIBILE_RE.test(p)
      ? ''
      : p
  )
  const offsets = []
  let cursore = 0
  for (const p of testoParagrafi) {
    offsets.push(cursore)
    cursore += p.length + 1 // +1 per lo spazio usato nel join
  }
  const testo = testoParagrafi.join(' ')

  // Confini di sezione in ordine: un'intestazione ATTREZZI imposta il gruppo
  // corrente, un qualsiasi altro titolo di sezione (MANDRINETTI, EXTRADOTAZIONE,
  // ecc.) lo azzera, perché da lì in poi le voci appartengono a un'altra parte
  // del documento e non vanno più etichettate con l'ATTREZZI precedente.
  const confini = []
  sottoParagrafi.forEach((p, i) => {
    const m = p.match(ATTREZZI_HEADER_RE)
    if (m) confini.push({ offset: offsets[i], gruppo: m[0].replace(/\s+/g, ' ').trim() })
    else if (SEZIONE_ESCLUSA_RE.test(p)) confini.push({ offset: offsets[i], gruppo: null })
  })
  function gruppoAllOffset(offset) {
    let corrente = null
    for (const c of confini) {
      if (c.offset <= offset) corrente = c.gruppo
      else break
    }
    return corrente
  }

  // Indice del paragrafo che contiene una certa posizione nel testo unito:
  // gli offset dei paragrafi svuotati coincidono con quelli vicini, ma i
  // paragrafi con contenuto hanno offset distinti, quindi la posizione di un
  // prezzo cade sempre nel paragrafo giusto.
  function paragrafoAllaPosizione(pos) {
    let idx = 0
    for (let k = 0; k < offsets.length; k++) {
      if (offsets[k] <= pos) idx = k
      else break
    }
    return idx
  }

  // Note di contesto da mostrare (es. 'Kit di riduzione ...'), con l'indice del
  // loro paragrafo: verranno ancorate alla prima voce a catalogo che le segue.
  // L'ancoraggio è per paragrafo (non per offset di carattere) perché la
  // descrizione di una voce può iniziare nel paragrafo precedente, sballando
  // di uno il confronto per posizione.
  const noteGrezze = []
  sottoParagrafi.forEach((p, i) => {
    if (NOTA_VISIBILE_RE.test(p)) noteGrezze.push({ paraIdx: i, testo: p.trim() })
  })
  // Voci 'Non disp.' (vedi sopra): raccolte a parte perché più di una può
  // condividere la stessa voce-ancora (es. 3 chiavi non disponibili di fila
  // prima della prima chiave con prezzo) e vanno unite in una sola nota.
  const nonDisponibiliGrezze = []
  sottoParagrafi.forEach((p, i) => {
    const m = p.match(NON_DISPONIBILE_RE)
    if (m) nonDisponibiliGrezze.push({ paraIdx: i, codice: m[1], descrizione: m[2].trim() })
  })

  const voci = []
  let ordine = 0
  let match
  let ultimoIndex = 0
  VOCE_PREZZO_RE.lastIndex = 0
  while ((match = VOCE_PREZZO_RE.exec(testo))) {
    let descrizioneGrezza = match[1].trim()
    const prezzo = euroToNumber(match[2])
    let tipoPrezzo = 'aggiunta'
    const suppMatch = descrizioneGrezza.match(SUPPLEMENTO_SUFFIX_RE)
    if (suppMatch) {
      tipoPrezzo = 'supplemento'
      descrizioneGrezza = descrizioneGrezza.slice(0, suppMatch.index).trim()
    }
    // Un'intestazione (es. 'ATTREZZI di PRESA MANDRINO ...') non ha un prezzo
    // proprio, quindi finisce incollata come prefisso alla PRIMA voce che la
    // segue: va tolta di qui, altrimenti rovina il riconoscimento del codice.
    const prefissoIntestazione = descrizioneGrezza.match(ATTREZZI_HEADER_PREFIX_RE)
    if (prefissoIntestazione) descrizioneGrezza = descrizioneGrezza.slice(prefissoIntestazione[0].length).trim()
    const classificata = classificaVoce(descrizioneGrezza)
    // La posizione (dentro o fuori una sezione ATTREZZI) ha sempre la
    // precedenza sull'euristica per parola chiave/prefisso codice: un codice
    // come T012 è ambiguo di per sé (può essere un kit di riduzione dentro
    // ATTREZZI DI PRESA oppure una chiave di bloccaggio altrove), lo decide
    // solo dove si trova nel documento.
    if (classificata.categoria === 'accessori_catalogo') {
      // Un'intestazione svuotata (blank) può finire come 'farcitura' iniziale
      // del match (nessun prezzo proprio, quindi assorbita nella parte non
      // greedy prima del prossimo €): si guarda la FINE del match, non
      // l'inizio, altrimenti un'intestazione appena precedente risulterebbe
      // erroneamente 'dopo' la voce per pochi caratteri di scarto.
      const gruppoPosizione = gruppoAllOffset(match.index + match[0].length)
      if (gruppoPosizione) classificata.gruppo = gruppoPosizione
    }
    // Il prezzo (fine del match) cade nel paragrafo della voce stessa, mentre
    // l'inizio della descrizione può stare nel paragrafo precedente: uso la
    // fine per attribuire la voce al paragrafo corretto.
    const paraIdx = paragrafoAllaPosizione(match.index + match[0].length - 1)
    voci.push({ ...classificata, tipo_prezzo: tipoPrezzo, prezzo, ordine: ordine++, _paraIdx: paraIdx })
    // Una regex globale resetta lastIndex a 0 quando exec() infine non trova più
    // corrispondenze: va catturato qui, subito dopo un match riuscito, non dopo il loop.
    ultimoIndex = VOCE_PREZZO_RE.lastIndex
  }

  // Ancora ogni nota alla prima voce a catalogo (con codice) che la segue nel
  // testo: quel codice è il punto in cui la nota va reinserita nel
  // configuratore, e il gruppo di quella voce è quello a cui la nota appartiene.
  const note = []
  for (const n of noteGrezze) {
    const voceDopo = voci.find((v) => v.categoria === 'accessori_catalogo' && v.codice && v._paraIdx > n.paraIdx)
    if (voceDopo) note.push({ gruppo: voceDopo.gruppo, primaVoceCodice: voceDopo.codice, testo: n.testo })
  }
  // Note incollate da classificaVoce (vedi _notaInline): qui si ancorano alla
  // STESSA voce da cui sono state estratte, non alla successiva.
  for (const v of voci) {
    if (v._notaInline) note.push({ gruppo: v.gruppo, primaVoceCodice: v.codice, testo: v._notaInline })
  }
  // Questa nota chiude concettualmente la sezione 'Mandrinetti motorizzati'
  // (parla del refrigerante interno dei mandrinetti) ma nel Master è
  // incollata testualmente alla prima voce di 'Extra dotazione' che segue
  // (un portautensile), perché è lì che classificaVoce trova il primo
  // codice+tab utile: la spostiamo invece in fondo a 'Mandrinetti
  // motorizzati' (primaVoceCodice: null = nota di chiusura sezione, non
  // ancorata a una voce specifica), più coerente per chi legge.
  const NOTA_CHIUSURA_MANDRINETTI_RE = /^I mandrinetti con refrigerante interno/i
  const haMandrinettiMotorizzati = voci.some((v) => v.gruppo === 'Mandrinetti motorizzati')
  for (const n of note) {
    if (NOTA_CHIUSURA_MANDRINETTI_RE.test(n.testo) && haMandrinettiMotorizzati) {
      n.gruppo = 'Mandrinetti motorizzati'
      n.primaVoceCodice = null
    }
  }
  // Le 'Non disp.' che condividono la stessa voce-ancora si uniscono in
  // un'unica nota: il rendering mostra una sola nota per gruppo+codice, se ne
  // pushassi una per ciascuna si sovrascriverebbero a vicenda.
  const gruppiNonDisponibili = new Map()
  for (const n of nonDisponibiliGrezze) {
    const voceDopo = voci.find((v) => v.categoria === 'accessori_catalogo' && v.codice && v._paraIdx > n.paraIdx)
    if (!voceDopo) continue
    const chiave = `${voceDopo.gruppo}|${voceDopo.codice}`
    if (!gruppiNonDisponibili.has(chiave)) {
      gruppiNonDisponibili.set(chiave, { gruppo: voceDopo.gruppo, primaVoceCodice: voceDopo.codice, voci: [] })
    }
    gruppiNonDisponibili.get(chiave).voci.push(`${n.codice} (${n.descrizione})`)
  }
  for (const g of gruppiNonDisponibili.values()) {
    note.push({ gruppo: g.gruppo, primaVoceCodice: g.primaVoceCodice, testo: `Non disponibili: ${g.voci.join(', ')}` })
  }
  for (const v of voci) {
    delete v._paraIdx
    delete v._notaInline
  }

  const resto = testo.slice(ultimoIndex).trim()
  const nonClassificato = resto ? [resto] : []
  return { voci, nonClassificato, note }
}

function vociDaTabelle(tabelle, paragrafi) {
  // Euristica: il gruppo (titolo tabella) è il paragrafo che compare subito
  // prima della prima riga della tabella nel testo piatto; non sempre
  // ricostruibile con precisione da mammoth+XML separati, quindi il campo
  // 'gruppo' va confermato/corretto in revisione manuale.
  const voci = []
  let ordine = 1000
  for (const tabella of tabelle) {
    for (const riga of tabella) {
      if (riga.length < 2) continue
      const [prima, ...resto] = riga
      const ultima = riga[riga.length - 1]
      const prezzoMatch = ultima.match(/€?\s*([\d.,]+)\s*$/)
      if (!prezzoMatch || !/[a-zA-Z]/.test(resto.join(''))) continue
      voci.push({
        categoria: 'accessori_catalogo',
        gruppo: null, // da confermare in revisione
        codice: /^[A-Z0-9.\-]+$/.test(prima) ? prima : null,
        descrizione: resto.slice(0, -1).join(' ').trim() || prima,
        tipo_prezzo: 'aggiunta',
        prezzo: euroToNumber(prezzoMatch[1]),
        ordine: ordine++,
      })
    }
  }
  return voci
}

async function main() {
  const paragrafi = await estraiParagrafi(inputPath)
  const tabelle = await estraiTabelle(inputPath)

  const idxPrezzoBase = paragrafi.findIndex((p) => PREZZO_BASE_RE.test(p))
  const idxSpecifiche = paragrafi.findIndex((p) => SPECIFICHE_HEADER_RE.test(p))
  const idxControllo = paragrafi.findIndex((p) => CONTROLLO_HEADER_RE.test(p))
  const idxMacro = paragrafi.findIndex((p) => MACRO_HEADER_RE.test(p))

  if (idxPrezzoBase === -1) {
    console.warn(`ATTENZIONE: riga prezzo base non trovata in ${inputPath}`)
  }

  const fineDescrizioneBase = idxSpecifiche !== -1 ? idxSpecifiche : idxPrezzoBase
  const descrizioneBase = paragrafi
    .slice(0, fineDescrizioneBase === -1 ? paragrafi.length : fineDescrizioneBase)
    .filter((p) => !FRASE_CORTESIA_RE.test(p))
    .join('\n')

  // La tabella CARATTERISTICHE TECNICHE nel Word è organizzata in gruppi
  // ('Campo di lavoro:', 'Elettromandrino:', 'Slitta a croce:', ...): il primo
  // segmento di una riga che termina con ':' apre un nuovo gruppo, valido per
  // tutte le righe successive finché non ne arriva un altro. Alcune righe sono
  // sotto-intestazioni senza valore proprio (es. 'asse "Z" carro longitudinale'
  // dentro 'Slitta a croce') e vanno mantenute come tali, non scartate.
  let specificheTecniche = []
  if (idxSpecifiche !== -1) {
    const fineSpecifiche = idxControllo !== -1 ? idxControllo : idxMacro !== -1 ? idxMacro : idxPrezzoBase
    const righeSpecifiche = paragrafi.slice(idxSpecifiche + 1, fineSpecifiche === -1 ? paragrafi.length : fineSpecifiche)
    let gruppoCorrente = null
    // 'Rumorosità' è sempre l'ultimo gruppo della tabella (note acustiche
    // prima del pannello CNC): una volta raggiunto, tutte le righe successive
    // restano sotto quel titolo anche se contengono un ':' proprio (es.
    // 'Pressioni acustica dBA :'), che è punteggiatura della nota e non un
    // nuovo gruppo tecnico — altrimenti si spezzerebbe in titoli spuri.
    let gruppoBloccato = false
    // Il Word a volte spezza il nome di un gruppo su due paragrafi per andare
    // a capo nella colonna (es. 'Impianto' + 'Lubrificazione:' -> un solo
    // gruppo 'Impianto Lubrificazione'): una riga di una o due parole senza
    // ':' resta 'in sospeso' finché non si scopre se la riga dopo la conferma
    // come prefisso di gruppo. Una frase lunga (es. una nota su più righe)
    // non è invece un prefisso spezzato: resta testo libero a sé.
    let prefissoInSospeso = null
    righeSpecifiche.forEach((riga) => {
      const parti = riga.split(/\t+/).map((s) => s.trim()).filter(Boolean)
      if (parti.length === 0) return
      if (gruppoBloccato) {
        specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: parti.join(' '), valore: null })
        return
      }
      if (parti.length === 1 && !parti[0].includes(':')) {
        if (parti[0].split(/\s+/).length <= 2) {
          if (prefissoInSospeso) specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: prefissoInSospeso, valore: null })
          prefissoInSospeso = parti[0]
          return
        }
        if (prefissoInSospeso) {
          specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: prefissoInSospeso, valore: null })
          prefissoInSospeso = null
        }
        specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: parti[0], valore: null })
        return
      }
      let primi = parti
      let gruppoAppenaAperto = false
      if (parti[0].includes(':')) {
        // Il nome del gruppo e la prima etichetta a volte condividono la
        // stessa cella (separati da uno spazio, non da un tab): es.
        // 'Impianto idraulico: capacità centralina' -> gruppo 'Impianto
        // idraulico', prima etichetta 'capacità centralina'.
        const [gruppoRaw, ...restoSegmento] = parti[0].split(':')
        gruppoCorrente = [prefissoInSospeso, gruppoRaw.trim()].filter(Boolean).join(' ')
        prefissoInSospeso = null
        gruppoAppenaAperto = true
        if (gruppoCorrente.toLowerCase() === 'rumorosità') gruppoBloccato = true
        const restoTrim = restoSegmento.join(':').trim()
        primi = restoTrim ? [restoTrim, ...parti.slice(1)] : parti.slice(1)
      } else if (prefissoInSospeso) {
        specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: prefissoInSospeso, valore: null })
        prefissoInSospeso = null
      }
      if (primi.length === 0) return
      if (primi.length === 1) {
        // Un gruppo con un solo valore numerico e nessuna etichetta propria
        // (es. 'Alimentazione: 400 V 50Hz.') non è una sotto-intestazione:
        // è l'intero contenuto del gruppo, va mostrato come riga normale
        // 'Alimentazione | 400 V 50Hz.' invece che come titolo senza valore.
        if (gruppoAppenaAperto && /^\d/.test(primi[0])) {
          specificheTecniche.push({ gruppo: null, etichetta: gruppoCorrente, valore: primi[0] })
          return
        }
        specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: primi[0], valore: null })
        return
      }
      specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: primi.slice(0, -1).join(' '), valore: primi[primi.length - 1] })
    })
    if (prefissoInSospeso) specificheTecniche.push({ gruppo: gruppoCorrente, etichetta: prefissoInSospeso, valore: null })
  }

  let macroistruzioni = null
  if (idxControllo !== -1 || idxMacro !== -1) {
    const inizioMacro = idxControllo !== -1 ? idxControllo : idxMacro
    const fineMacro = idxPrezzoBase !== -1 ? idxPrezzoBase : paragrafi.length
    macroistruzioni = paragrafi.slice(inizioMacro, fineMacro).join('\n')
  }

  let prezzoBase = null
  const matchPrezzoBase = idxPrezzoBase !== -1 ? paragrafi[idxPrezzoBase].match(PREZZO_BASE_RE) : null
  if (matchPrezzoBase) prezzoBase = euroToNumber(matchPrezzoBase[1])

  const startOptional = idxPrezzoBase !== -1 ? idxPrezzoBase + 1 : paragrafi.length
  const { voci: vociOptional, nonClassificato, note } = segmentaOptional(paragrafi, startOptional, paragrafi.length)

  const vociCatalogo = vociDaTabelle(tabelle, paragrafi)

  const codice = guessCodiceModello(inputPath)
  const tuttiVoci = [...vociOptional, ...vociCatalogo]
  const nOptional = tuttiVoci.filter((v) => v.categoria === 'optional_macchina').length
  const nCatalogo = tuttiVoci.filter((v) => v.categoria === 'accessori_catalogo').length
  const risultato = {
    codice,
    nome_commerciale: `Biglia ${codice}`,
    serie: guessSerie(codice),
    data_listino: guessDataListino(inputPath), // verificare in revisione
    descrizione_base: descrizioneBase,
    specifiche_tecniche: specificheTecniche,
    macroistruzioni,
    prezzo_base: prezzoBase,
    voci_opzionali: tuttiVoci,
    note,
    file_origine: basename(inputPath),
    _non_classificato: nonClassificato,
  }

  writeFileSync(outputPath, JSON.stringify(risultato, null, 2), 'utf-8')
  console.log(
    `${basename(inputPath)} -> ${nOptional} optional, ${nCatalogo} accessori, ` +
      `prezzo_base=${prezzoBase}, non_classificato=${nonClassificato.length}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
