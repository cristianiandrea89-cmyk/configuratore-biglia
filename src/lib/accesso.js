// Chiavi di sblocco/modalità e uscita ("Esci"): chi esce torna alla schermata della password DELLA VERSIONE
// IN CUI SI TROVA — dalla demo si ritorna all'accesso demo, dalla versione interna all'accesso interno.
// Per passare dall'una all'altra: ?demo=1 (demo) oppure ?demo=0 / riaprire il sito senza parametri (interna).
import { modalitaDemo } from './modalitaDemo'

export const CHIAVE_SBLOCCO = 'configuratore_biglia_unlocked'
export const CHIAVE_SBLOCCO_DEMO = 'configuratore_biglia_unlocked_demo'

export function esci() {
  try {
    if (modalitaDemo()) {
      // resta in modalità demo (flag di sessione): si toglie solo lo sblocco della demo
      localStorage.removeItem(CHIAVE_SBLOCCO_DEMO)
    } else {
      localStorage.removeItem(CHIAVE_SBLOCCO)
    }
  } catch {
    /* storage non disponibile */
  }
  window.location.assign('/')
}
