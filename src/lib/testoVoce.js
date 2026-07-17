// Le righe di descrizione (composizione base, macroistruzioni) iniziano quasi
// sempre con il nome della voce in maiuscolo (es. "BASAMENTO", "SLITTA A CROCE",
// "TESTA MANDRINO PRINCIPALE CON ELETTROMANDRINO ASA 5”") seguito dal resto
// della descrizione in maiuscolo/minuscolo normale. Questa funzione separa le
// due parti così il nome della voce può essere mostrato in grassetto.
export function separaTitoloVoce(riga) {
  const parole = riga.split(' ')
  let i = 0
  for (; i < parole.length; i++) {
    const lettere = parole[i].replace(/[^A-Za-zÀ-ÿ]/g, '')
    if (lettere && lettere !== lettere.toUpperCase()) break
  }
  if (i === 0) return { titolo: null, resto: riga }
  return { titolo: parole.slice(0, i).join(' '), resto: parole.slice(i).join(' ') }
}

// Prefissi noti di unità/misura con cui iniziano i valori nel blocco
// 'Caratteristiche tecniche: ...' incorporato nella descrizione delle voci
// Versioni (mandrino alternativo): servono a riconoscere dove finisce un
// valore e inizia l'etichetta successiva, dato che nel Word sono separati
// da un solo spazio (non da un tab, a differenza della tabella principale).
const PREFISSO_VALORE_RE = /^\s*((?:ASA|mm\.|Kw\.?|Nm|cm\.q\.?|da ?N|giri|Bar|N)\s*[\d][\d.,\-/x]*(?:\s*max\.)?[”"']?)\s+(\S[\s\S]*)$/i
const VALORE_NUDO_RE = /^\s*([\d][\d.,\-/x]*)\s+(\S[\s\S]*)$/

// Separa la frase introduttiva di una voce 'Versioni' (es. 'VERSIONI CON
// MANDRINO ... fornito in alternativa al mandrino standard.') dal blocco
// 'Caratteristiche tecniche: ...' che segue, e prova a spezzare quest'ultimo
// in righe etichetta/valore come nella tabella Caratteristiche tecniche
// principale — altrimenti resta un unico paragrafo illeggibile.
export function separaCaratteristicheTecniche(descrizione) {
  const match = descrizione.match(/^([\s\S]*?)Caratteristiche tecniche:\s*([\s\S]*)$/i)
  if (!match) return { intro: descrizione, righe: [] }
  const intro = match[1].trim()
  const segmenti = match[2]
    .split(/\t+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (segmenti.length === 0) return { intro, righe: [] }
  const righe = []
  let etichettaCorrente = segmenti[0]
  for (let i = 1; i < segmenti.length; i++) {
    const segmento = segmenti[i]
    if (i === segmenti.length - 1) {
      righe.push({ etichetta: etichettaCorrente, valore: segmento })
      break
    }
    const trovato = segmento.match(PREFISSO_VALORE_RE) || segmento.match(VALORE_NUDO_RE)
    if (trovato) {
      righe.push({ etichetta: etichettaCorrente, valore: trovato[1].trim() })
      etichettaCorrente = trovato[2].trim()
    } else {
      // Pattern non riconosciuto: si tiene il segmento come valore così com'è
      // invece di scartarlo, degrado morbido piuttosto che un dato perso.
      righe.push({ etichetta: etichettaCorrente, valore: segmento })
      etichettaCorrente = null
    }
  }
  return { intro, righe }
}

// Raggruppa le righe consecutive di specifiche_tecniche per 'gruppo' (es.
// 'Campo di lavoro', 'Elettromandrino', ...), preservando l'ordine originale
// così da rispecchiare l'impaginazione della tabella nel Word. Condivisa tra
// la UI del configuratore e il PDF finale, che devono mostrare la stessa
// tabella raggruppata invece di un elenco piatto.
export function raggruppaSpecifiche(righe) {
  const gruppi = []
  for (const riga of righe) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo && ultimo.gruppo === riga.gruppo) ultimo.righe.push(riga)
    else gruppi.push({ gruppo: riga.gruppo, righe: [riga] })
  }
  return gruppi
}

// Le due intestazioni di sezione dentro 'macroistruzioni' (testo libero dopo
// la tabella caratteristiche tecniche nel Word: pannello CNC + programmazione
// ISO), da mostrare in grassetto invece che come normale voce di elenco.
export const MACRO_SEZIONE_RE = /^(CONTROLLO\s+(FANUC|MITSUBISHI|SIEMENS|HEIDENHAIN)|ELENCO\s+MACROISTRUZIONI)/i
