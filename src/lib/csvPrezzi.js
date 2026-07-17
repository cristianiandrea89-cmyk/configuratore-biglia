import Papa from 'papaparse'
import { supabase } from './supabaseClient'
import { normalizza } from './normalizza'

// Colonne attese: codice_modello, tipo_riga (base|opzionale), gruppo,
// codice_voce, descrizione, prezzo, tipo_prezzo. Solo 'codice_modello',
// 'tipo_riga' e 'prezzo' sono strettamente necessarie per il matching.
export function parseCsvPrezzi(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (risultato) => resolve(risultato.data),
      error: reject,
    })
  })
}

// Modelli attivi con le rispettive voci, serve come base per il matching:
// una singola query di partenza invece di interrogare il DB riga per riga.
export async function fetchModelliConVociPerCsv() {
  const { data: modelli, error: errModelli } = await supabase.from('modelli').select('*').eq('attivo', true)
  if (errModelli) throw errModelli
  if (!modelli.length) return []

  // Supabase risponde al massimo 1000 righe per query: con ~3800 voci_opzionali
  // totali servono più pagine, altrimenti buona parte del matching fallirebbe
  // silenziosamente (falsi 'voce non trovata') solo perché la riga non è mai
  // arrivata dal DB.
  const modelloIds = modelli.map((m) => m.id)
  const voci = []
  const PAGINA = 1000
  for (let offset = 0; ; offset += PAGINA) {
    const { data: pagina, error: errVoci } = await supabase
      .from('voci_opzionali')
      .select('*')
      .in('modello_id', modelloIds)
      .range(offset, offset + PAGINA - 1)
    if (errVoci) throw errVoci
    voci.push(...pagina)
    if (pagina.length < PAGINA) break
  }

  return modelli.map((m) => ({ ...m, voci_opzionali: voci.filter((v) => v.modello_id === m.id) }))
}

// Per ogni riga del CSV, trova il modello (per codice) e, se non è una riga
// 'base', la voce corrispondente (per codice_voce o, in mancanza, per
// descrizione), confrontando il prezzo attuale col nuovo — non scrive nulla,
// serve solo a costruire la schermata di revisione prima della conferma.
export function costruisciDiff(righeCsv, modelli) {
  return righeCsv.map((riga) => {
    const codiceModello = (riga.codice_modello || '').trim()
    const tipoRiga = (riga.tipo_riga || '').trim().toLowerCase()
    const prezzoNuovo = parseFloat(String(riga.prezzo ?? '').replace(',', '.'))
    const modello = modelli.find((m) => m.codice === codiceModello)

    if (!modello) {
      return { riga, stato: 'modello_non_trovato', modello: null, voce: null, prezzoAttuale: null, prezzoNuovo }
    }

    if (tipoRiga === 'base') {
      const prezzoAttuale = Number(modello.prezzo_base)
      return {
        riga,
        stato: prezzoAttuale === prezzoNuovo ? 'invariato' : 'modificato',
        modello,
        voce: null,
        prezzoAttuale,
        prezzoNuovo,
      }
    }

    const codiceVoce = (riga.codice_voce || '').trim()
    const descrizioneNorm = normalizza(riga.descrizione || '')
    let voce = codiceVoce ? modello.voci_opzionali.find((v) => v.codice === codiceVoce) : null
    if (!voce && descrizioneNorm) {
      voce = modello.voci_opzionali.find((v) => normalizza(v.descrizione) === descrizioneNorm)
    }
    if (!voce) {
      return { riga, stato: 'voce_non_trovata', modello, voce: null, prezzoAttuale: null, prezzoNuovo }
    }

    const prezzoAttuale = Number(voce.prezzo)
    return {
      riga,
      stato: prezzoAttuale === prezzoNuovo ? 'invariato' : 'modificato',
      modello,
      voce,
      prezzoAttuale,
      prezzoNuovo,
    }
  })
}

// Applica solo le righe 'modificato' confermate dall'utente. Un aggiornamento
// prezzi non tocca mai in place la riga 'modelli' esistente: crea una nuova
// versione (nuova data_listino) e disattiva la vecchia, così le offerte già
// salvate restano coerenti sullo snapshot storico. Le voci_opzionali del
// modello vengono ricopiate sulla nuova versione, con i prezzi aggiornati
// solo dove il CSV lo richiede.
export async function applicaAggiornamentoPrezzi(righeDiff, creatoDa) {
  const daApplicare = righeDiff.filter((r) => r.stato === 'modificato' && r.modello)
  const modelliCoinvolti = [...new Set(daApplicare.map((r) => r.modello.id))]
  const oggi = new Date().toISOString().slice(0, 10)

  for (const modelloId of modelliCoinvolti) {
    const vecchioModello = daApplicare.find((r) => r.modello.id === modelloId).modello
    const rigaBase = daApplicare.find((r) => r.modello.id === modelloId && r.voce === null)
    const nuovoPrezzoBase = rigaBase ? rigaBase.prezzoNuovo : Number(vecchioModello.prezzo_base)

    // Un indice unico garantisce un solo modello 'attivo' per codice: si
    // inserisce la nuova versione da SPENTA, si disattiva la vecchia e solo
    // per ultimo si accende la nuova, così l'unico istante 'senza modello
    // attivo' per questo codice è il più corto possibile (e se qualcosa
    // fallisce prima, la vecchia versione resta comunque quella attiva).
    const { data: nuovoModello, error: errInsertModello } = await supabase
      .from('modelli')
      .insert({
        codice: vecchioModello.codice,
        nome_commerciale: vecchioModello.nome_commerciale,
        sottotitolo: vecchioModello.sottotitolo,
        serie: vecchioModello.serie,
        data_listino: oggi,
        descrizione_base: vecchioModello.descrizione_base,
        specifiche_tecniche: vecchioModello.specifiche_tecniche,
        macroistruzioni: vecchioModello.macroistruzioni,
        prezzo_base: nuovoPrezzoBase,
        attivo: false,
        file_origine: vecchioModello.file_origine,
        creato_da: creatoDa || null,
      })
      .select()
      .single()
    if (errInsertModello) throw errInsertModello

    const modifichePerVoce = new Map(daApplicare.filter((r) => r.voce).map((r) => [r.voce.id, r.prezzoNuovo]))
    const nuoveVoci = vecchioModello.voci_opzionali.map((v) => ({
      modello_id: nuovoModello.id,
      categoria: v.categoria,
      gruppo: v.gruppo,
      codice: v.codice,
      descrizione: v.descrizione,
      tipo_prezzo: v.tipo_prezzo,
      prezzo: modifichePerVoce.has(v.id) ? modifichePerVoce.get(v.id) : v.prezzo,
      ordine: v.ordine,
    }))
    if (nuoveVoci.length) {
      const { error: errInsertVoci } = await supabase.from('voci_opzionali').insert(nuoveVoci)
      if (errInsertVoci) throw errInsertVoci
    }

    const { error: errDisattiva } = await supabase.from('modelli').update({ attivo: false }).eq('id', modelloId)
    if (errDisattiva) throw errDisattiva

    const { error: errAttiva } = await supabase.from('modelli').update({ attivo: true }).eq('id', nuovoModello.id)
    if (errAttiva) throw errAttiva
  }

  return { modelliAggiornati: modelliCoinvolti.length, righeAggiornate: daApplicare.length }
}
