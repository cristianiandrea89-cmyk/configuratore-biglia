import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ImageRun,
  BorderStyle,
  ShadingType,
  TabStopType,
  Tab,
  PageNumber,
} from 'docx'
import logo from '../assets/logo-scassellati.png'
import isoBadge from '../assets/iso9001.png'
import fotoB620 from '../assets/modelli/b620.png'
import fotoB750 from '../assets/modelli/b750.png'
import fotoB1250 from '../assets/modelli/b1250.png'
import fotoBMX from '../assets/modelli/bmx.png'
import { separaTitoloVoce, separaCaratteristicheTecniche, raggruppaSpecifiche, MACRO_SEZIONE_RE } from '../lib/testoVoce'
import noteVoci from '../data/noteVoci.json'
import { calcolaSconto } from '../lib/sconto'

// Impaginazione ricalcata sulle offerte Biglia più recenti della cartella OFFERTE
// 2026 (es. I.M.A.R. B620 YS): A4 compatto con margini ridotti, Calibri 9pt,
// titoli di sezione in grassetto, caratteristiche tecniche in tabelle a due
// colonne con bordi grigi, accessori come "TITOLO in grassetto + descrizione",
// riepilogo prezzi in tabella "OFFERTA ECONOMICA" (intestazione blu scuro),
// condizioni di fornitura in righe brevi, chiusura "Restando a disposizione...".
// Intestazione con logo Scassellati + bollino ISO 9001, piè di pagina con dati
// societari e "Pagina X di Y   OFF.N°...".

// Foto ufficiale Biglia per serie (non esiste una foto diversa per ogni
// variante: le varianti di una stessa serie condividono lo stesso telaio,
// cambiano dotazioni/software non l'aspetto esterno). Fonte: bigliaspa.it.
const FOTO_SERIE = {
  B620: fotoB620,
  B750: fotoB750,
  B1250: fotoB1250,
  BMX: fotoBMX,
}

// Disegni tecnici degli accessori a catalogo, estratti una tantum dai Master
// (scripts/estrai-foto-accessori.mjs) e salvati come src/assets/accessori/
// <codice modello>/<codice voce>.png — non tutte le voci ne hanno una (il
// Master non le disegna tutte, o la corrispondenza codice non è stata
// riconosciuta con certezza: in quel caso si preferisce ometterla piuttosto
// che rischiare di mostrare la foto sbagliata).
const FOTO_ACCESSORI = import.meta.glob('/src/assets/accessori/**/*.{png,jpg,jpeg}', {
  eager: true,
  import: 'default',
})

function trovaFotoAccessorio(modelloCodice, voceCodice) {
  if (!modelloCodice || !voceCodice) return null
  const suffisso = `/accessori/${modelloCodice}/${voceCodice}.`
  const chiave = Object.keys(FOTO_ACCESSORI).find((p) => p.includes(suffisso))
  return chiave ? FOTO_ACCESSORI[chiave] : null
}

// Geometria in twip: A4 11906 x 16838, margini come l'offerta di riferimento.
const MARGINI = { top: 1500, right: 900, bottom: 1200, left: 900, header: 560, footer: 708 }
const LARGHEZZA_TESTO = 11906 - MARGINI.left - MARGINI.right // 10106

const FONT = 'Calibri'
const DIM_CORPO = 22 // 11pt, in mezzi punti
const DIM_TABELLA = 20 // 10pt
// Palette Scassellati (src/index.css): bronzo, grigio scuro, grigio, bianco sporco.
const BRONZO = 'CE9041'
const GRIGIO_SCURO = '2D2926'
const GRIGIO = 'CFCECF'
const BIANCO_SPORCO = 'F6F6F6'
const BRONZO_CHIARO = 'F3E2C7' // tinta leggera del bronzo, per le dotazioni incluse
const BLU = GRIGIO_SCURO // intestazioni tabella prezzi
const GRIGIO_BORDO = GRIGIO

const CAMPI_CONDIZIONI = [
  ['consegna', 'Consegna'],
  ['resa', 'Resa'],
  ['collaudo', 'Collaudo'],
  ['messa_in_funzione', 'Messa in funzione'],
  ['corso_programmazione', 'Corso di programmazione'],
  ['pagamento', 'Pagamento'],
  ['garanzia', 'Garanzia'],
  ['validita_offerta', 'Validità offerta'],
]

function formattaImporto(n) {
  // useGrouping 'always': in italiano i numeri a 4 cifre non avrebbero il punto delle migliaia (1730,00).
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(
    Number(n)
  )
}

// Le descrizioni degli accessori nel DB spesso iniziano con "- " e il "titolo"
// maiuscolo finisce con un trattino ("ER-25QF - cilindrico d.16x17"): si ripulisce.
function titoloEResto(descrizione) {
  const pulita = descrizione.replace(/^[\s\-–•]+/, '')
  const { titolo, resto } = separaTitoloVoce(pulita)
  return { titolo: titolo ? titolo.replace(/[\s\-–:]+$/, '') : null, resto: resto.replace(/^[\s\-–]+/, '') }
}

function formattaDataEstesa(iso) {
  const d = iso ? new Date(iso) : new Date()
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

const NESSUN_BORDO = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const bordiColore = (colore) => {
  const b = { style: BorderStyle.SINGLE, size: 3, color: colore }
  return { top: b, bottom: b, left: b, right: b }
}

function run(testo, opzioni = {}) {
  return new TextRun({ text: testo, font: FONT, size: DIM_CORPO, ...opzioni })
}

function paragrafo(children, spacing = { after: 100 }, opzioni = {}) {
  // keepLines: un paragrafo non si spezza mai a cavallo di due pagine.
  return new Paragraph({ keepLines: true, spacing, children, ...opzioni })
}

// Titolo di sezione: grassetto 9,5pt, spazio sopra (come "DESCRIZIONE MACCHINA",
// "OFFERTA ECONOMICA", "CONDIZIONI DI FORNITURA").
function titoloSezione(testo, { nuovaPagina = false } = {}) {
  return new Paragraph({
    pageBreakBefore: nuovaPagina,
    keepNext: true,
    spacing: { before: 160, after: 60 },
    // Filetto bronzo sotto il titolo di sezione (colore di accento Scassellati).
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, space: 2, color: BRONZO } },
    children: [run(testo, { bold: true, size: 28 })], // titoli di sezione 14pt
  })
}

// Riquadro giallo centrato come nei Master Biglia (titolo macchina, intestazione di
// ogni gruppo di accessori / versione alternativa). Paragrafi consecutivi con gli
// stessi bordi vengono fusi da Word in un unico riquadro.
const BORDO_RIQUADRO = { style: BorderStyle.SINGLE, size: 6, space: 1, color: GRIGIO_SCURO }
function riquadro(testo, { primo = true, ultimo = true, bold = true, size = 24 } = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    keepLines: true,
    spacing: { before: primo ? 200 : 0, after: ultimo ? 100 : 0 },
    // Stessa larghezza delle tabelle (il bordo del paragrafo sporge ~1pt oltre il rientro).
    indent: { left: 30, right: 30 },
    border: { top: BORDO_RIQUADRO, bottom: BORDO_RIQUADRO, left: BORDO_RIQUADRO, right: BORDO_RIQUADRO },
    shading: { type: ShadingType.CLEAR, fill: BRONZO, color: 'auto' },
    children: [run(testo, { bold, size })],
  })
}

// Riga "etichetta ........ € importo" con l'importo allineato a destra (come i prezzi dei Master).
function rigaPrezzo(etichetta, importo, { grassettoEtichetta = true, etichettaRuns = null, keepNext = false } = {}) {
  return new Paragraph({
    keepNext,
    tabStops: [{ type: TabStopType.RIGHT, position: LARGHEZZA_TESTO }],
    indent: { right: 1400 },
    spacing: { before: 40, after: 100 },
    children: [
      ...(etichettaRuns || [run(etichetta, { bold: grassettoEtichetta })]),
      new TextRun({ children: [new Tab()], font: FONT, size: DIM_CORPO }),
      run(`€  ${formattaImporto(importo)}`, { bold: true }),
    ],
  })
}

function puntoElenco(runs, { livello = 0, spacing = { after: 40 }, keepNext = false } = {}) {
  const rientro = 360 + livello * 360
  return new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: rientro }],
    indent: { left: rientro, hanging: 220 },
    spacing,
    keepNext,
    keepLines: true,
    children: [run('•'), new TextRun({ children: [new Tab()], font: FONT, size: DIM_CORPO }), ...runs],
  })
}

function sottotitolo(testo, prima = 0) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: prima, after: 60 },
    children: [run(testo, { bold: true })],
  })
}

async function caricaImmagine(src, larghezza) {
  const risposta = await fetch(src)
  const buffer = await risposta.arrayBuffer()
  const dimensioni = await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: larghezza, height: larghezza })
    img.src = src
  })
  const altezza = Math.round(larghezza * (dimensioni.height / dimensioni.width))
  return new ImageRun({ data: buffer, transformation: { width: larghezza, height: altezza }, type: 'png' })
}

// Tabella a due colonne etichetta/valore con bordi grigi (caratteristiche tecniche).
// unita: tiene tutte le righe sulla stessa pagina (e agganciate al paragrafo seguente).
// Righe alternate in bianco sporco e valori in grassetto per scorrere meglio le colonne.
function tabellaSpecifiche(righe, { unita = false, larghezza = LARGHEZZA_TESTO, colEtichetta = null, evidenza = false } = {}) {
  // Se non è fissata, la colonna dei valori si allarga quanto serve perché il valore più lungo
  // (es. "SET di nr. 2 chiavi per ER-25QF (ed ER32)") stia su una riga sola: ~112 twip per
  // carattere a 10pt grassetto, tra 3306 e 6200.
  if (colEtichetta === null) {
    const piuLungo = Math.max(0, ...righe.map((r) => String(r.valore ?? '').length))
    const colValoreStimata = Math.min(6200, Math.max(larghezza - 6800, piuLungo * 112 + 240))
    colEtichetta = larghezza - colValoreStimata
  }
  const colValore = larghezza - colEtichetta
  // evidenza: dotazioni incluse nel prezzo, con bordo bronzo e fondo caldo.
  const bordi = bordiColore(evidenza ? BRONZO : GRIGIO_BORDO)
  // In evidenza anche un filetto più spesso a sinistra, come un "segno di spunta" sull'elenco.
  const bordiEvidenzaEtichetta = { ...bordi, left: { style: BorderStyle.SINGLE, size: 24, color: BRONZO } }
  return new Table({
    width: { size: larghezza, type: WidthType.DXA },
    columnWidths: [colEtichetta, colValore],
    rows: righe.map((s, i) => {
      const sfondo = evidenza
        ? { type: ShadingType.CLEAR, fill: i % 2 === 1 ? BRONZO_CHIARO : 'FFFFFF', color: 'auto' }
        : i % 2 === 1
          ? { type: ShadingType.CLEAR, fill: BIANCO_SPORCO, color: 'auto' }
          : undefined
      return new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: colEtichetta, type: WidthType.DXA },
            borders: evidenza ? bordiEvidenzaEtichetta : bordi,
            shading: sfondo,
            children: [paragrafo([run(s.etichetta ?? '', { size: DIM_TABELLA })], { after: 0 }, { keepNext: unita })],
          }),
          new TableCell({
            width: { size: colValore, type: WidthType.DXA },
            borders: bordi,
            shading: sfondo,
            children: [
              paragrafo(
                [run(s.valore ?? '', { size: DIM_TABELLA, bold: true })],
                { after: 0 },
                { alignment: AlignmentType.RIGHT, keepNext: unita }
              ),
            ],
          }),
        ],
      })
    }),
  })
}

// Unità di caratteristiche tecniche: titolo (gruppo o sottogruppo) + righe etichetta/valore.
function unitaSpecifiche(specifiche) {
  const unita = []
  for (const gruppo of raggruppaSpecifiche(specifiche)) {
    let corrente = { titolo: gruppo.gruppo ? `${gruppo.gruppo}:` : null, righe: [], padre: gruppo.gruppo }
    unita.push(corrente)
    for (const s of gruppo.righe) {
      if (s.valore === null) {
        corrente = { titolo: s.etichetta, righe: [], padre: gruppo.gruppo }
        unita.push(corrente)
      } else {
        corrente.righe.push(s)
      }
    }
  }
  return unita.filter((u) => u.titolo || u.righe.length > 0)
}

// Due unità corte affiancate in una tabella senza bordi (risparmia pagine).
function coppiaAffiancata(a, b) {
  const COL = 4953
  const GAP = LARGHEZZA_TESTO - COL * 2
  const cella = (u) =>
    new TableCell({
      width: { size: COL, type: WidthType.DXA },
      borders: NESSUN_BORDO,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [
        sottotitolo(u.titolo || '', 0),
        tabellaSpecifiche(u.righe, { unita: true, larghezza: COL, colEtichetta: 3300 }),
        paragrafo([], { after: 60 }),
      ],
    })
  return new Table({
    width: { size: LARGHEZZA_TESTO, type: WidthType.DXA },
    columnWidths: [COL, GAP, COL],
    borders: { ...NESSUN_BORDO, insideHorizontal: NESSUN_BORDO.top, insideVertical: NESSUN_BORDO.top },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cella(a),
          new TableCell({ width: { size: GAP, type: WidthType.DXA }, borders: NESSUN_BORDO, children: [paragrafo([], { after: 0 })] }),
          cella(b),
        ],
      }),
    ],
  })
}

// Riga della tabella "OFFERTA ECONOMICA".
function cellaEconomica(testo, larghezza, { destra = false, intestazione = false, span = 1, grassetto = false, dim = DIM_TABELLA, bronzo = false } = {}) {
  const colore = intestazione ? BLU : bronzo ? BRONZO : GRIGIO_BORDO
  return new TableCell({
    width: { size: larghezza, type: WidthType.DXA },
    columnSpan: span,
    borders: bordiColore(colore),
    shading: intestazione
      ? { type: ShadingType.CLEAR, fill: BLU, color: 'auto' }
      : bronzo
        ? { type: ShadingType.CLEAR, fill: BRONZO, color: 'auto' }
        : undefined,
    children: [
      paragrafo(
        [run(testo, { size: dim, bold: intestazione || bronzo || grassetto, color: intestazione ? 'FFFFFF' : undefined })],
        { after: 0 },
        { alignment: destra ? AlignmentType.RIGHT : AlignmentType.LEFT }
      ),
    ],
  })
}

// sconto: risultato di calcolaSconto o null; modalitaSconto 'mostra' | 'netto'.
function tabellaEconomica(righe, totale, sconto = null, modalitaSconto = 'mostra') {
  const COL = [5806, 700, 1800, 1800]
  const intestazione = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      cellaEconomica('Descrizione', COL[0], { intestazione: true }),
      cellaEconomica('Qtà', COL[1], { intestazione: true, destra: true }),
      cellaEconomica('Prezzo unit. (EUR)', COL[2], { intestazione: true, destra: true }),
      cellaEconomica('Importo (EUR)', COL[3], { intestazione: true, destra: true }),
    ],
  })
  const corpo = righe.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: [
          cellaEconomica(r.descrizione, COL[0]),
          cellaEconomica(String(r.quantita), COL[1], { destra: true }),
          cellaEconomica(formattaImporto(r.unitario), COL[2], { destra: true }),
          cellaEconomica(formattaImporto(r.importo), COL[3], { destra: true, grassetto: true }),
        ],
      })
  )
  const rigaScontoNetto = (testoNetto) =>
    new TableRow({
      cantSplit: true,
      children: [
        cellaEconomica(testoNetto, COL[0] + COL[1] + COL[2], { bronzo: true, destra: true, span: 3, dim: DIM_CORPO }),
        cellaEconomica(`EUR ${formattaImporto(sconto?.netto ?? 0)}`, COL[3], { bronzo: true, destra: true, dim: DIM_CORPO }),
      ],
    })
  // Solo netto: come nelle offerte storiche, nessun totale di listino né sconto, solo il netto riservato.
  if (sconto && modalitaSconto === 'netto') {
    return new Table({
      width: { size: LARGHEZZA_TESTO, type: WidthType.DXA },
      columnWidths: COL,
      rows: [intestazione, ...corpo, rigaScontoNetto('PREZZO NETTO A VOI RISERVATO')],
    })
  }
  const rigaTotale = new TableRow({
    cantSplit: true,
    children: [
      // Come nelle offerte Biglia storiche: "PREZZO TOTALE DELLA FORNITURA"; l'IVA è detta solo nelle
      // condizioni ("I prezzi si intendono al netto dell'IVA").
      cellaEconomica('PREZZO TOTALE DELLA FORNITURA', COL[0] + COL[1] + COL[2], {
        intestazione: true,
        destra: true,
        span: 3,
        dim: DIM_CORPO,
      }),
      cellaEconomica(`EUR ${formattaImporto(totale)}`, COL[3], { intestazione: true, destra: true, dim: DIM_CORPO }),
    ],
  })
  return new Table({
    width: { size: LARGHEZZA_TESTO, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      intestazione,
      ...corpo,
      rigaTotale,
      ...(sconto
        ? [
            new TableRow({
              cantSplit: true,
              children: [
                cellaEconomica(
                  `SCONTO ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(sconto.percentuale)}%`,
                  COL[0] + COL[1] + COL[2],
                  { destra: true, span: 3, dim: DIM_CORPO }
                ),
                cellaEconomica(`- EUR ${formattaImporto(sconto.importoSconto)}`, COL[3], { destra: true, dim: DIM_CORPO }),
              ],
            }),
            rigaScontoNetto('PREZZO NETTO A VOI RISERVATO'),
          ]
        : []),
    ],
  })
}

// Scheda di sintesi in testa all'offerta: totale in evidenza + dati commerciali chiave,
// così chi legge trova subito prezzo, consegna, pagamento, garanzia e validità.
function schedaSintesi(offerta, modello, numeroVoci, sconto = null) {
  const META = LARGHEZZA_TESTO / 2
  const bordi = bordiColore(GRIGIO_BORDO)
  const totaleAccessori = Number(offerta.totale) - Number(offerta.prezzo_base_snapshot)
  const campo = (etichetta, valore, grande = false) => [
    paragrafo([run(etichetta.toUpperCase(), { size: 16, color: '7A746F' })], { after: 0 }, { keepNext: true }),
    paragrafo([run(valore || '—', { size: grande ? 22 : 20, bold: grande })], { after: 0 }),
  ]
  const cella = (children) =>
    new TableCell({
      width: { size: META, type: WidthType.DXA },
      borders: bordi,
      shading: { type: ShadingType.CLEAR, fill: BIANCO_SPORCO, color: 'auto' },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children,
    })
  const riga = (sx, dx) => new TableRow({ cantSplit: true, children: [cella(sx), cella(dx)] })
  const barra = (testo, destra) =>
    new TableCell({
      width: { size: META, type: WidthType.DXA },
      borders: bordiColore(GRIGIO_SCURO),
      shading: { type: ShadingType.CLEAR, fill: GRIGIO_SCURO, color: 'auto' },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [
        paragrafo(
          [run(testo, { bold: true, size: destra ? 28 : 22, color: 'FFFFFF' })],
          { after: 0 },
          { alignment: destra ? AlignmentType.RIGHT : AlignmentType.LEFT, keepNext: true }
        ),
      ],
    })
  return new Table({
    width: { size: LARGHEZZA_TESTO, type: WidthType.DXA },
    columnWidths: [META, META],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          barra('SINTESI DELL’OFFERTA', false),
          barra(`EUR ${formattaImporto(sconto ? sconto.netto : offerta.totale)}`, true),
        ],
      }),
      riga(campo('Macchina', modello.nome_commerciale, true), campo('Consegna', offerta.consegna)),
      riga(campo('Prezzo macchina base', `EUR ${formattaImporto(offerta.prezzo_base_snapshot)}`, true), campo('Resa', offerta.resa)),
      riga(
        campo(
          numeroVoci > 0 ? `Accessori e optional (${numeroVoci})` : 'Accessori e optional',
          numeroVoci > 0 ? `EUR ${formattaImporto(totaleAccessori)}` : 'nessuno',
          true
        ),
        campo('Pagamento', offerta.pagamento)
      ),
      riga(campo('Validità offerta', offerta.validita_offerta), campo('Garanzia', offerta.garanzia)),
    ],
  })
}

// Descrizione breve di una voce per la tabella prezzi: "T012-00 PORTAPINZA ..." tagliata.
function descrizioneBreve(voce) {
  const { titolo, resto } = titoloEResto(voce.descrizione_snapshot)
  // Optional di macchina: descrizioni lunghe in prosa, in tabella basta il titolo.
  if (voce.voci_opzionali?.categoria === 'optional_macchina') {
    const supplemento = voce.voci_opzionali.tipo_prezzo === 'supplemento'
    const nome = (supplemento && titoloVersione(voce.descrizione_snapshot)) || titolo || resto.slice(0, 60)
    return supplemento ? `${nome} (supplemento)` : nome
  }
  let testo = [titolo, resto].filter(Boolean).join(' - ')
  if (testo.length > 110) testo = `${testo.slice(0, 107).trimEnd()}...`
  return voce.codice_snapshot ? `${voce.codice_snapshot} — ${testo}` : testo
}

// Titolo breve di una versione alternativa del mandrino ("MANDRINO PRINCIPALE ASA 6” (foro 71)"),
// come nella UI del configuratore, invece del testo lungo del Master.
function titoloVersione(descrizione) {
  const asa = descrizione.match(/ASA\s*(\d+)/i)?.[1]
  const foro = descrizione.match(/foro\s*([\d,]+)/i)?.[1]
  if (!asa) return null
  return `MANDRINO PRINCIPALE ASA ${asa}” ${foro ? `(foro ${foro})` : ''}`.trim()
}

function costruisciIntestazione(logoRun, badgeRun) {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: LARGHEZZA_TESTO }],
        children: [logoRun, new TextRun({ children: [new Tab()] }), badgeRun],
      }),
    ],
  })
}

function costruisciPiePagina(numeroOfferta) {
  const riga = (testo) => new Paragraph({ spacing: { after: 0 }, children: [run(testo, { size: 18 })] })
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 150, after: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, space: 4, color: GRIGIO } },
        children: [run('F. SCASSELLATI s.r.l.', { bold: true })],
      }),
      riga('Via del Casale Ferranti, 85  00173 Roma'),
      riga('Tel. 06/93020906'),
      riga('e-mail : segreteria@scassellati.com    www.fscassellati.com'),
      riga('PEC : fscassellati@pec.it'),
      riga('C.F & P.I. : IT05309771003   SDI : SUBM70N'),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [
          new TextRun({
            children: ['Pagina ', PageNumber.CURRENT, ' di ', PageNumber.TOTAL_PAGES],
            font: FONT,
            size: 18,
          }),
          run(`   OFF.N°${numeroOfferta}`, { size: 18 }),
        ],
      }),
    ],
  })
}

// opzioni.scontoModalita: con uno sconto, 'mostra' (SCONTO x% + netto riservato) o 'netto' (solo netto).
export async function generaWordOfferta(offerta, { scontoModalita = 'mostra' } = {}) {
  const sconto = calcolaSconto(offerta.totale, offerta.sconto_percentuale)
  const { clienti: cliente, modelli: modello, voci_selezionate: voci } = offerta
  const logoRun = await caricaImmagine(logo, 200)
  const badgeRun = await caricaImmagine(isoBadge, 55)
  const fotoModelloSrc = FOTO_SERIE[modello.serie]
  const fotoModelloRun = fotoModelloSrc ? await caricaImmagine(fotoModelloSrc, 470) : null

  const children = []

  // Data a sinistra, destinatario a destra (tabella senza bordi).
  const COL_DATA = 4800
  const COL_DEST = LARGHEZZA_TESTO - COL_DATA
  const rigaDest = (testo, bold = false) =>
    new Paragraph({ spacing: { after: 0 }, children: [run(testo, { size: 24, bold })] })
  const destinatario = [rigaDest('Spett.le')]
  if (cliente?.ragione_sociale) {
    destinatario.push(rigaDest(cliente.ragione_sociale.toUpperCase(), true))
    if (cliente.indirizzo) destinatario.push(rigaDest(cliente.indirizzo))
    if (cliente.citta) destinatario.push(rigaDest(cliente.citta))
  } else {
    // Offerta senza cliente: segnaposto tra parentesi quadre, da completare a mano nel Word.
    destinatario.push(rigaDest('[RAGIONE SOCIALE CLIENTE]', true))
    destinatario.push(rigaDest('[Indirizzo]'))
    destinatario.push(rigaDest('[CAP Città (Prov.)]'))
  }
  if (cliente?.referente_nome) destinatario.push(rigaDest(`Alla C.A. ${cliente.referente_nome}`))
  children.push(
    new Table({
      width: { size: LARGHEZZA_TESTO, type: WidthType.DXA },
      columnWidths: [COL_DATA, COL_DEST],
      borders: { ...NESSUN_BORDO, insideHorizontal: NESSUN_BORDO.top, insideVertical: NESSUN_BORDO.top },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: COL_DATA, type: WidthType.DXA },
              borders: NESSUN_BORDO,
              children: [
                new Paragraph({
                  spacing: { after: 80 },
                  children: [run(offerta.citta_data || `Roma, ${formattaDataEstesa(offerta.created_at)}`, { size: 24 })],
                }),
              ],
            }),
            new TableCell({ width: { size: COL_DEST, type: WidthType.DXA }, borders: NESSUN_BORDO, children: destinatario }),
          ],
        }),
      ],
    })
  )
  children.push(paragrafo([], { after: 100 }))

  children.push(paragrafo([run(`OFFERTA N° ${offerta.numero}`, { bold: true, size: 28 })], { after: 200 }))
  children.push(
    paragrafo(
      [
        run(
          'Vi ringraziamo per la fiducia che ci esternate interpellandoci, sottoponiamo la nostra migliore offerta e ' +
            'rimaniamo a disposizione per fornirVi in seguito, ogni dettaglio a Voi utile alla migliore comprensione ' +
            'della medesima.'
        ),
      ],
      { after: 150 }
    )
  )
  children.push(schedaSintesi(offerta, modello, voci.length, sconto))
  children.push(paragrafo([], { after: 120 }))

  // Titolo macchina centrato: "Tornio BIGLIA" / "Mod. B 620 ..." (prime due righe della descrizione base).
  const righeBase = modello.descrizione_base.split('\n').filter(Boolean)
  // Come nei Master: riquadro giallo con "Tornio BIGLIA", "Mod. ..." e le righe di
  // sintesi (torretta, assi, mandrino) che precedono la prima voce con titolo maiuscolo.
  if (righeBase.length >= 2 && /^Tornio\s+BIGLIA/i.test(righeBase[0]) && /^Mod\./i.test(righeBase[1])) {
    const intestazioneMacchina = righeBase.splice(0, 2)
    const sintesi = []
    while (righeBase.length > 0 && !separaTitoloVoce(righeBase[0]).titolo) sintesi.push(righeBase.shift())
    const righeRiquadro = [
      { testo: intestazioneMacchina[0], bold: true },
      { testo: intestazioneMacchina[1], bold: true },
      ...sintesi.map((testo) => ({ testo, bold: false })),
    ]
    righeRiquadro.forEach((r, i) =>
      children.push(
        riquadro(r.testo, { primo: i === 0, ultimo: i === righeRiquadro.length - 1, bold: r.bold, size: r.bold ? 28 : 22 })
      )
    )
  } else {
    children.push(riquadro(modello.nome_commerciale, { size: 28 }))
  }

  if (fotoModelloRun) {
    children.push(paragrafo([fotoModelloRun], { after: 160 }, { alignment: AlignmentType.CENTER }))
  }

  if (righeBase.length > 0) {
    // La prima pagina è la presentazione (sintesi, titolo, foto): la descrizione parte dalla seconda.
    children.push(titoloSezione('DESCRIZIONE MACCHINA', { nuovaPagina: true }))
    // Nei Master le righe dopo "... completa di:" sono elenchi puntati fino alla prossima
    // voce con titolo maiuscolo: il DB conserva il testo ma non i pallini.
    // Ogni voce (titolo + descrizione + eventuale elenco) resta unita: se la descrizione
    // non entra nella pagina, l'intera voce slitta alla pagina successiva (keepNext/keepLines).
    let inElenco = false
    for (const [idx, riga] of righeBase.entries()) {
      const { titolo, resto } = separaTitoloVoce(riga)
      if (titolo) inElenco = false
      const prosegue = idx < righeBase.length - 1 && !separaTitoloVoce(righeBase[idx + 1]).titolo
      if (inElenco) {
        children.push(puntoElenco([run(riga)], { keepNext: prosegue }))
      } else {
        children.push(
          paragrafo([...(titolo ? [run(`${titolo} `, { bold: true })] : []), run(resto)], { after: 100 }, { keepNext: prosegue, keepLines: true })
        )
      }
      if (/:\s*$/.test(riga.trim())) inElenco = true
    }
  }

  if (modello.specifiche_tecniche?.length > 0) {
    // Le caratteristiche tecniche partono sempre da una pagina nuova.
    children.push(titoloSezione('CARATTERISTICHE TECNICHE', { nuovaPagina: true }))
    const unita = unitaSpecifiche(modello.specifiche_tecniche)
    const corta = (u) => u.righe.length > 0 && u.righe.length <= 8
    // Gruppo "in dotazione": è ciò che è compreso nel prezzo, quindi riquadro dedicato e
    // tabelle con bordo bronzo (il resto delle caratteristiche resta in grigio).
    const eDotazione = (u) => /^(in )?dotazione$/i.test((u.padre || '').trim())
    let dotazioneAperta = false
    for (let k = 0; k < unita.length; k++) {
      const u = unita[k]
      const prossima = unita[k + 1]
      if (eDotazione(u)) {
        if (!dotazioneAperta) {
          children.push(riquadro('IN DOTAZIONE', { size: 24 }))
          dotazioneAperta = true
        }
        if (u.titolo && !/^(in )?dotazione:?$/i.test(u.titolo.trim())) children.push(sottotitolo(u.titolo, 60))
        if (u.righe.length > 0) children.push(tabellaSpecifiche(u.righe, { evidenza: true }))
        continue
      }
      dotazioneAperta = false
      // Si affiancano solo sottogruppi dello stesso gruppo (es. asse Z e asse X della slitta a croce).
      if (corta(u) && prossima && corta(prossima) && u.padre && u.padre === prossima.padre) {
        children.push(coppiaAffiancata(u, prossima))
        k++
      } else {
        if (u.titolo) children.push(sottotitolo(u.titolo, k === 0 ? 0 : 100))
        if (u.righe.length > 0) children.push(tabellaSpecifiche(u.righe))
      }
    }
  }

  if (modello.macroistruzioni) {
    for (const riga of modello.macroistruzioni.split('\n').filter(Boolean)) {
      if (MACRO_SEZIONE_RE.test(riga)) children.push(titoloSezione(riga))
      else children.push(paragrafo([run(riga)], { after: 100 }))
    }
  }

  // Accessori/optional scelti: titolo in grassetto + descrizione, con miniatura quando disponibile.
  if (voci.length > 0) {
    children.push(titoloSezione('ACCESSORI E OPTIONAL SELEZIONATI'))
    const categoriaDi = (v) => v.voci_opzionali?.categoria
    const gruppoDi = (v) => v.voci_opzionali?.gruppo || null
    const importoRiga = (v) => Number(v.prezzo_snapshot) * (v.quantita || 1)
    const prefissoQuantita = (v) => (v.quantita > 1 ? `N. ${v.quantita} × ` : '')

    // 1) Optional di macchina (prosa). Le versioni alternative a supplemento (es. mandrino
    // ASA 6"/8") hanno riquadro giallo, caratteristiche e riga "SUPPLEMENTO", come nei Master.
    for (const v of voci.filter((x) => categoriaDi(x) === 'optional_macchina')) {
      const supplemento = v.voci_opzionali?.tipo_prezzo === 'supplemento'
      const { titolo, resto } = titoloEResto(v.descrizione_snapshot)
      const { intro, righe } = separaCaratteristicheTecniche(resto)
      const nome = titolo || v.descrizione_snapshot.slice(0, 60)
      if (supplemento) {
        children.push(riquadro(`${prefissoQuantita(v)}${titoloVersione(v.descrizione_snapshot) || nome}`))
        // Con titolo ricavato da "ASA n"/"foro n" il resto breve ("foro 102,5") è già nel riquadro.
        if (intro && intro.length > 30) children.push(paragrafo([run(intro)], { after: 60 }, { keepNext: true, keepLines: true }))
        if (righe.length > 0) children.push(tabellaSpecifiche(righe, { unita: true }))
        children.push(rigaPrezzo('SUPPLEMENTO', importoRiga(v)))
      } else {
        children.push(rigaPrezzo(`${prefissoQuantita(v)}${nome}`, importoRiga(v), { keepNext: true }))
        if (intro) children.push(paragrafo([run(intro)], { after: 60 }, { keepNext: righe.length > 0 }))
        if (righe.length > 0) children.push(tabellaSpecifiche(righe, { unita: false }))
        else if (!intro && resto) children.push(paragrafo([run(resto)], { after: 100 }))
      }
    }

    // 2) Accessori a catalogo raggruppati per gruppo (riquadro giallo per gruppo), una riga
    // "CODICE - descrizione ........ € prezzo" per voce, note di gruppo dai Master in corsivo.
    const noteSopra = new Map()
    const noteFine = new Map()
    for (const n of noteVoci[modello.codice] || []) {
      if (n.primaVoceCodice) noteSopra.set(`${n.gruppo}|${n.primaVoceCodice}`, n.testo)
      else noteFine.set(n.gruppo, n.testo)
    }
    const gruppi = new Map()
    for (const v of voci.filter((x) => categoriaDi(x) !== 'optional_macchina')) {
      const chiave = gruppoDi(v) || 'Altri accessori'
      if (!gruppi.has(chiave)) gruppi.set(chiave, [])
      gruppi.get(chiave).push(v)
    }
    for (const [gruppo, lista] of gruppi) {
      children.push(riquadro(gruppo.toUpperCase()))
      for (const v of lista) {
        const nota = v.codice_snapshot && noteSopra.get(`${gruppoDi(v)}|${v.codice_snapshot}`)
        if (nota) {
          children.push(
            new Paragraph({ keepNext: true, spacing: { before: 60, after: 20 }, children: [run(nota, { italics: true })] })
          )
        }
        const descrizione = v.descrizione_snapshot.replace(/^[\s\-–•]+/, '')
        const runsEtichetta = [
          ...(v.quantita > 1 ? [run(prefissoQuantita(v), { bold: true })] : []),
          ...(v.codice_snapshot ? [run(`${v.codice_snapshot} - `, { bold: true })] : []),
          run(descrizione),
        ]
        // I kit di riduzione (T012-...) sono voci secondarie: nei Master sono elenchi puntati.
        const secondaria = /^T012-/.test(v.codice_snapshot || '')
        const fotoAccessorio = trovaFotoAccessorio(modello.codice, v.codice_snapshot)
        children.push(
          new Paragraph({
            tabStops: [
              { type: TabStopType.LEFT, position: 360 },
              { type: TabStopType.RIGHT, position: LARGHEZZA_TESTO },
            ],
            indent: secondaria ? { left: 360, hanging: 220, right: 1400 } : { right: 1400 },
            spacing: { before: 20, after: 20 },
            keepNext: Boolean(fotoAccessorio),
            keepLines: true,
            children: [
              ...(secondaria ? [run('•'), new TextRun({ children: [new Tab()], font: FONT, size: DIM_CORPO })] : []),
              ...runsEtichetta,
              new TextRun({ children: [new Tab()], font: FONT, size: DIM_CORPO }),
              run(`€  ${formattaImporto(importoRiga(v))}`, { bold: true }),
            ],
          })
        )
        if (fotoAccessorio) {
          const fotoRun = await caricaImmagine(fotoAccessorio, 70)
          children.push(paragrafo([fotoRun], { after: 60 }, { indent: { left: secondaria ? 360 : 0 } }))
        }
      }
      const notaFine = noteFine.get(gruppo)
      if (notaFine) {
        children.push(
          new Paragraph({ spacing: { before: 40, after: 60 }, children: [run(notaFine, { italics: true })] })
        )
      }
      children.push(paragrafo([], { after: 60 }))
    }
  }

  // Tabella prezzi: tornio base + una riga per voce (prezzo × quantità) + totale.
  children.push(titoloSezione('OFFERTA ECONOMICA'))
  const righeEconomiche = [
    {
      descrizione: `${modello.nome_commerciale}, versione base`,
      quantita: 1,
      unitario: Number(offerta.prezzo_base_snapshot),
      importo: Number(offerta.prezzo_base_snapshot),
    },
    ...voci.map((v) => ({
      descrizione: descrizioneBreve(v),
      quantita: v.quantita || 1,
      unitario: Number(v.prezzo_snapshot),
      importo: Number(v.prezzo_snapshot) * (v.quantita || 1),
    })),
  ]
  children.push(tabellaEconomica(righeEconomiche, offerta.totale, sconto, scontoModalita))
  children.push(paragrafo([], { after: 80 }))

  children.push(titoloSezione('CONDIZIONI DI FORNITURA'))
  const rigaCondizione = (children2, ultima = false) =>
    paragrafo(children2, { after: ultima ? 200 : 20 })
  const condizioni = [
    [run('Condizioni di vendita e di fornitura secondo norme UCIMU e condizioni generali di contratto di vendita “Biglia” in vigore da maggio 2003.')],
    [run('Macchina costruita secondo capitolato Biglia.')],
    [run('I prezzi si intendono al netto dell’IVA.')],
    ...CAMPI_CONDIZIONI.filter(([campo]) => offerta[campo]).map(([campo, etichetta]) => [
      run(`${etichetta}: ${offerta[campo]}`),
    ]),
  ]
  condizioni.forEach((c, i) => children.push(rigaCondizione(c, i === condizioni.length - 1)))

  children.push(
    paragrafo(
      [
        run(
          'Restando a disposizione per eventuali chiarimenti tecnici o commerciali, cogliamo l’occasione per porgere distinti saluti.',
          { size: 22 }
        ),
      ],
      { before: 300, after: 200 }
    )
  )
  children.push(
    paragrafo([run('F. SCASSELLATI SRL', { bold: true, size: 22 })], { after: 80 }, { alignment: AlignmentType.RIGHT })
  )

  const documento = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: DIM_CORPO, color: GRIGIO_SCURO } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: MARGINI,
          },
        },
        headers: { default: costruisciIntestazione(logoRun, badgeRun) },
        footers: { default: costruisciPiePagina(offerta.numero) },
        children,
      },
    ],
  })

  return Packer.toBlob(documento)
}
