// Confronto "tollerante" tra nomi: ignora punteggiatura, spazi e maiuscole/minuscole,
// così "T.M.P." e "tmp" (o "ILM" e "I.L.M.") vengono riconosciuti come lo stesso nome.
export function normalizza(testo) {
  return testo.toLowerCase().replace(/[^a-z0-9]/g, '')
}
