// Chiavi di sblocco/modalità e uscita ("Esci"): chi esce torna alla schermata della password.
export const CHIAVE_SBLOCCO = 'configuratore_biglia_unlocked'
export const CHIAVE_SBLOCCO_DEMO = 'configuratore_biglia_unlocked_demo'
export const CHIAVE_DEMO = 'configuratore_biglia_demo'

export function esci() {
  try {
    localStorage.removeItem(CHIAVE_SBLOCCO)
    localStorage.removeItem(CHIAVE_SBLOCCO_DEMO)
    localStorage.removeItem(CHIAVE_DEMO)
    sessionStorage.removeItem(CHIAVE_DEMO)
  } catch {
    /* storage non disponibile */
  }
  window.location.assign('/')
}
