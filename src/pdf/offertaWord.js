import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ImageRun,
  BorderStyle,
} from 'docx'
import logo from '../assets/logo-scassellati.png'
import fotoB620 from '../assets/modelli/b620.png'
import fotoB750 from '../assets/modelli/b750.png'
import fotoB1250 from '../assets/modelli/b1250.png'
import fotoBMX from '../assets/modelli/bmx.png'
import { separaTitoloVoce, raggruppaSpecifiche, MACRO_SEZIONE_RE } from '../lib/testoVoce'

// Foto ufficiale Biglia per serie (non esiste una foto diversa per ogni
// variante: le varianti di una stessa serie condividono lo stesso telaio,
// cambiano dotazioni/software non l'aspetto esterno). Fonte: bigliaspa.it.
const FOTO_SERIE = {
  B620: fotoB620,
  B750: fotoB750,
  B1250: fotoB1250,
  BMX: fotoBMX,
}

const BRONZE = 'CE9041'
const DGRAY = '2D2926'

function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

const CAMPI_CONDIZIONI = [
  ['consegna', 'Consegna'],
  ['resa', 'Resa'],
  ['collaudo', 'Collaudo'],
  ['messa_in_funzione', 'Messa in funzione'],
  ['corso_programmazione', 'Corso di programmazione'],
  ['pagamento', 'Pagamento'],
  ['garanzia', 'Garanzia'],
  ['validita_offerta', "Validità offerta"],
]

const SENZA_BORDI = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

// Riga a due colonne (etichetta/valore) senza bordi visibili, usata sia per le
// caratteristiche tecniche sia per le condizioni di fornitura: replica in
// Word l'impaginazione a colonne del PDF, dove una Table è l'unico modo per
// allineare in modo affidabile testo a sinistra e a destra sulla stessa riga.
function rigaEtichettaValore(etichetta, valore, { larghezzaEtichetta = 40, boldValore = false } = {}) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: larghezzaEtichetta, type: WidthType.PERCENTAGE },
        borders: SENZA_BORDI,
        children: [new Paragraph({ children: [new TextRun({ text: etichetta })] })],
      }),
      new TableCell({
        width: { size: 100 - larghezzaEtichetta, type: WidthType.PERCENTAGE },
        borders: SENZA_BORDI,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: valore, bold: boldValore })],
          }),
        ],
      }),
    ],
  })
}

function tabellaSenzaBordi(righe) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: righe })
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

export async function generaWordOfferta(offerta) {
  const { clienti: cliente, modelli: modello, voci_selezionate: voci } = offerta
  const logoRun = await caricaImmagine(logo, 180)
  const fotoModelloSrc = FOTO_SERIE[modello.serie]
  const fotoModelloRun = fotoModelloSrc ? await caricaImmagine(fotoModelloSrc, 420) : null

  const children = []

  children.push(new Paragraph({ children: [logoRun], spacing: { after: 300 } }))

  children.push(
    tabellaSenzaBordi([
      new TableRow({
        children: [
          new TableCell({
            width: { size: 55, type: WidthType.PERCENTAGE },
            borders: SENZA_BORDI,
            children: [
              new Paragraph({ children: [new TextRun('Spett.le')] }),
              new Paragraph({ children: [new TextRun(cliente?.ragione_sociale || '—')] }),
              ...(cliente?.indirizzo ? [new Paragraph({ children: [new TextRun(cliente.indirizzo)] })] : []),
              ...(cliente?.citta ? [new Paragraph({ children: [new TextRun(cliente.citta)] })] : []),
              ...(cliente?.referente_nome
                ? [new Paragraph({ children: [new TextRun(`Alla C.A. ${cliente.referente_nome}`)] })]
                : []),
            ],
          }),
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            borders: SENZA_BORDI,
            children: [
              ...(offerta.citta_data
                ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(offerta.citta_data)] })]
                : []),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `Offerta n. ${offerta.numero}`, color: BRONZE })],
              }),
            ],
          }),
        ],
      }),
    ])
  )

  children.push(
    new Paragraph({
      spacing: { before: 300, after: 200 },
      children: [
        new TextRun({
          text: (offerta.titolo || modello.nome_commerciale).toUpperCase(),
          bold: true,
          size: 28,
        }),
      ],
    })
  )

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun(
          'Vi ringraziamo per la fiducia che ci esternate interpellandoci, sottoponiamo la nostra migliore offerta e ' +
            'rimaniamo a disposizione per fornirVi in seguito ogni dettaglio a Voi utile alla migliore comprensione ' +
            'della medesima.'
        ),
      ],
    })
  )

  if (fotoModelloRun) {
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [fotoModelloRun] })
    )
  }

  for (const riga of modello.descrizione_base.split('\n').filter(Boolean)) {
    const { titolo, resto } = separaTitoloVoce(riga)
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          ...(titolo ? [new TextRun({ text: `${titolo} `, bold: true })] : []),
          new TextRun(resto),
        ],
      })
    )
  }

  if (voci.length > 0) {
    children.push(sezioneTitolo('Dotazione supplementare'))
    for (const v of voci) {
      const { titolo, resto } = separaTitoloVoce(v.descrizione_snapshot)
      const prezzoRiga = formattaPrezzo(Number(v.prezzo_snapshot) * (v.quantita || 1))
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          alignment: AlignmentType.JUSTIFIED,
          children: [
            ...(v.quantita > 1 ? [new TextRun(`N. ${v.quantita} × `)] : []),
            ...(titolo ? [new TextRun({ text: `${titolo} `, bold: true })] : []),
            new TextRun(`${resto} `),
            new TextRun({ text: prezzoRiga, bold: true, color: BRONZE }),
          ],
        })
      )
    }
  }

  if (modello.specifiche_tecniche?.length > 0) {
    children.push(sezioneTitolo('Caratteristiche tecniche'))
    for (const gruppo of raggruppaSpecifiche(modello.specifiche_tecniche)) {
      if (gruppo.gruppo) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [new TextRun({ text: gruppo.gruppo.toUpperCase(), bold: true })],
          })
        )
      }
      const righeTabella = gruppo.righe
        .filter((s) => s.valore !== null)
        .map((s) => rigaEtichettaValore(s.etichetta, s.valore))
      if (righeTabella.length > 0) children.push(tabellaSenzaBordi(righeTabella))
      for (const s of gruppo.righe.filter((s) => s.valore === null)) {
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [new TextRun({ text: s.etichetta, bold: true })],
          })
        )
      }
    }
  }

  if (modello.macroistruzioni) {
    children.push(sezioneTitolo('Macroistruzioni e dispositivi in dotazione'))
    for (const riga of modello.macroistruzioni.split('\n').filter(Boolean)) {
      const isTitolo = MACRO_SEZIONE_RE.test(riga)
      children.push(
        new Paragraph({
          spacing: { before: isTitolo ? 120 : 0, after: isTitolo ? 40 : 100 },
          children: [new TextRun({ text: riga, bold: isTitolo })],
        })
      )
    }
  }

  children.push(
    new Paragraph({
      spacing: { before: 300, after: 300 },
      children: [
        new TextRun({ text: 'Prezzo totale della fornitura ', bold: true, size: 24 }),
        new TextRun({ text: `${formattaPrezzo(offerta.totale)} `, bold: true, size: 24, color: BRONZE }),
        new TextRun({ text: '+ IVA', bold: true, size: 24 }),
      ],
    })
  )

  children.push(sezioneTitolo('Condizioni di fornitura'))
  const righeCondizioni = CAMPI_CONDIZIONI.filter(([campo]) => offerta[campo]).map(([campo, label]) =>
    rigaEtichettaValoreTesto(label, offerta[campo])
  )
  if (righeCondizioni.length > 0) children.push(tabellaSenzaBordi(righeCondizioni))

  children.push(
    new Paragraph({ spacing: { before: 300 }, children: [new TextRun('Gradite distinti saluti.')] })
  )
  children.push(
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'F. SCASSELLATI SRL', bold: true })] })
  )

  const documento = new Document({
    sections: [{ properties: {}, children }],
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 20, color: DGRAY } },
      },
    },
  })

  return Packer.toBlob(documento)
}

function sezioneTitolo(testo) {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text: testo.toUpperCase(), bold: true, size: 22 })],
  })
}

// Come rigaEtichettaValore ma per testo libero multi-riga (condizioni di
// fornitura), che può essere più lungo di un valore tecnico secco.
function rigaEtichettaValoreTesto(etichetta, testo) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: SENZA_BORDI,
        children: [new Paragraph({ children: [new TextRun({ text: etichetta, bold: true })] })],
      }),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: SENZA_BORDI,
        children: [new Paragraph({ children: [new TextRun(testo)] })],
      }),
    ],
  })
}
