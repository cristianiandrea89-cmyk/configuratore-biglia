// Numero offerta nel formato reale "NNN/AA" (es. "438/26"), preso a mano dal progressivo ufficiale
// su OneDrive (04_Offerte/OFFERTE 2026/00_Progressivo Offerte). Restituisce {numero} o null.
export function leggiNumeroUfficiale(testo) {
  const m = String(testo ?? '').trim().match(/^(\d{1,4})\s*\/\s*(\d{2})$/)
  return m ? { numero: `${Number(m[1])}/${m[2]}` } : null
}
