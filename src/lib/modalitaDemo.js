// Modalità presentazione: per mostrare il configuratore a terzi (es. Biglia) senza far vedere i dati reali.
// Si attiva aprendo il sito con ?demo=1 (resta attiva su quel dispositivo) e si disattiva con ?demo=0.
// In modalità demo sono nascosti: Bozze, Storico (offerte passate), Aggiorna prezzi, elenco clienti,
// suggerimenti basati sullo storico e il campo Sconto. Non è una protezione dei dati (il database resta
// raggiungibile da chi lo sa fare): serve solo a non mostrarli a schermo.
const CHIAVE = 'configuratore_biglia_demo'

// Con VITE_SOLO_DEMO=true (deploy dedicato alla demo, es. un secondo progetto Vercel) la modalità presentazione
// è sempre attiva e non si può spegnere con ?demo=0.
const SOLO_DEMO = import.meta.env.VITE_SOLO_DEMO === 'true'

export function inizializzaModalitaDemo() {
  if (SOLO_DEMO) return
  try {
    const param = new URLSearchParams(window.location.search).get('demo')
    if (param === '1') localStorage.setItem(CHIAVE, '1')
    else if (param === '0') localStorage.removeItem(CHIAVE)
  } catch {
    /* storage non disponibile: la modalità demo non è attivabile */
  }
}

export function modalitaDemo() {
  if (SOLO_DEMO) return true
  try {
    return localStorage.getItem(CHIAVE) === '1'
  } catch {
    return false
  }
}
