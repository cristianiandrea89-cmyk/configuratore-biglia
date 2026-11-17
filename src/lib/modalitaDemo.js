// Modalità presentazione: per mostrare il configuratore a terzi (es. Biglia) senza far vedere i dati reali.
// Si attiva aprendo il sito con ?demo=1 e vale solo per la sessione del browser (scheda/finestra): chiudendo e
// riaprendo il sito, o aprendolo senza ?demo=1, si torna alla versione completa. Con ?demo=0 si spegne subito.
// In modalità demo sono nascosti: Bozze, Storico (offerte passate), Aggiorna prezzi, elenco clienti e
// suggerimenti basati sullo storico. Il campo Sconto resta disponibile (si può mostrare la funzione).
// Non è una protezione dei dati (il database resta raggiungibile da chi lo sa fare): serve solo a non mostrarli a schermo.
import { CHIAVE_DEMO } from './accesso'

// Con VITE_SOLO_DEMO=true (deploy dedicato alla demo, es. un secondo progetto Vercel) la modalità presentazione
// è sempre attiva e non si può spegnere con ?demo=0.
const SOLO_DEMO = import.meta.env.VITE_SOLO_DEMO === 'true'

export function inizializzaModalitaDemo() {
  if (SOLO_DEMO) return
  try {
    // versioni precedenti salvavano la modalità sul dispositivo: si elimina, ora vale solo per la sessione
    localStorage.removeItem(CHIAVE_DEMO)
    const param = new URLSearchParams(window.location.search).get('demo')
    if (param === '1') sessionStorage.setItem(CHIAVE_DEMO, '1')
    else if (param === '0') sessionStorage.removeItem(CHIAVE_DEMO)
  } catch {
    /* storage non disponibile: la modalità demo non è attivabile */
  }
}

export function modalitaDemo() {
  if (SOLO_DEMO) return true
  try {
    return sessionStorage.getItem(CHIAVE_DEMO) === '1'
  } catch {
    return false
  }
}
