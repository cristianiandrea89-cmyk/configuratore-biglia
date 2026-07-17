import { useState } from 'react'
import { parseCsvPrezzi, fetchModelliConVociPerCsv, costruisciDiff, applicaAggiornamentoPrezzi } from '../lib/csvPrezzi'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Button from '../components/Button'

function formattaPrezzo(prezzo) {
  if (prezzo === null || Number.isNaN(prezzo)) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

const STATO_LABEL = {
  modificato: 'Prezzo diverso',
  invariato: 'Invariato',
  modello_non_trovato: 'Modello non trovato',
  voce_non_trovata: 'Voce non trovata',
}

const STATO_COLORE = {
  modificato: 'text-bronze font-medium',
  invariato: 'text-dgray/50',
  modello_non_trovato: 'text-red-600 font-medium',
  voce_non_trovata: 'text-red-600 font-medium',
}

export default function AggiornaPrezziPage() {
  const { utente } = useCurrentUser()
  const [diff, setDiff] = useState(null)
  const [mostraInvariate, setMostraInvariate] = useState(false)
  const [caricamento, setCaricamento] = useState(false)
  const [applicazione, setApplicazione] = useState(false)
  const [errore, setErrore] = useState(null)
  const [esito, setEsito] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErrore(null)
    setEsito(null)
    setDiff(null)
    setCaricamento(true)
    try {
      const [righeCsv, modelli] = await Promise.all([parseCsvPrezzi(file), fetchModelliConVociPerCsv()])
      setDiff(costruisciDiff(righeCsv, modelli))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setCaricamento(false)
      e.target.value = ''
    }
  }

  async function handleConferma() {
    setApplicazione(true)
    setErrore(null)
    try {
      const risultato = await applicaAggiornamentoPrezzi(diff, utente)
      setEsito(risultato)
      setDiff(null)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setApplicazione(false)
    }
  }

  const modificate = diff?.filter((r) => r.stato === 'modificato') || []
  const nonTrovate = diff?.filter((r) => r.stato === 'modello_non_trovato' || r.stato === 'voce_non_trovata') || []
  const invariate = diff?.filter((r) => r.stato === 'invariato') || []
  const righeMostrate = diff ? (mostraInvariate ? diff : diff.filter((r) => r.stato !== 'invariato')) : []

  return (
    <div>
      <h1 className="font-heading text-2xl font-extrabold uppercase text-dgray">Aggiorna prezzi</h1>
      <p className="mt-2 text-sm text-dgray/70">
        Carica un CSV con colonne <code>codice_modello, tipo_riga (base/opzionale), gruppo, codice_voce, descrizione,
        prezzo, tipo_prezzo</code>. Nulla viene scritto subito: prima trovi qui sotto un confronto tra prezzo attuale e
        nuovo, poi confermi tu.
      </p>

      <div className="mt-4">
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="text-sm file:mr-3 file:py-2 file:px-3 file:rounded-sm file:border-0 file:bg-dgray file:text-offwhite file:text-sm file:font-medium file:cursor-pointer cursor-pointer"
        />
      </div>

      {caricamento && <p className="mt-4 text-sm text-dgray/70">Lettura CSV in corso…</p>}
      {errore && <p className="mt-4 text-sm text-red-600">{errore}</p>}

      {esito && (
        <p className="mt-4 text-sm text-dgray bg-offwhite border border-gray/30 rounded-sm px-3 py-2">
          Fatto: {esito.modelliAggiornati} modell{esito.modelliAggiornati === 1 ? 'o aggiornato' : 'i aggiornati'} (
          {esito.righeAggiornate} prezz{esito.righeAggiornate === 1 ? 'o' : 'i'} cambiat
          {esito.righeAggiornate === 1 ? 'o' : 'i'}). I modelli precedenti restano storicizzati per le offerte già
          salvate.
        </p>
      )}

      {diff && (
        <div className="mt-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="text-sm text-dgray">
              <span className="text-bronze font-medium">{modificate.length} da aggiornare</span>
              {' · '}
              <span className="text-dgray/60">{invariate.length} invariate</span>
              {nonTrovate.length > 0 && (
                <>
                  {' · '}
                  <span className="text-red-600 font-medium">{nonTrovate.length} non trovate</span>
                </>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-dgray/70">
              <input
                type="checkbox"
                checked={mostraInvariate}
                onChange={(e) => setMostraInvariate(e.target.checked)}
                className="accent-bronze"
              />
              Mostra anche le invariate
            </label>
          </div>

          {righeMostrate.length === 0 ? (
            <p className="text-sm text-dgray/60">Nessuna riga da mostrare.</p>
          ) : (
            <div className="overflow-x-auto border border-gray/30 rounded-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray/30 text-left text-xs uppercase text-dgray/60 bg-offwhite">
                    <th className="py-2 px-3 font-medium">Modello</th>
                    <th className="py-2 px-3 font-medium">Voce</th>
                    <th className="py-2 px-3 font-medium text-right">Attuale</th>
                    <th className="py-2 px-3 font-medium text-right">Nuovo</th>
                    <th className="py-2 px-3 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {righeMostrate.map((r, i) => (
                    <tr key={i} className="border-b border-gray/20 last:border-b-0">
                      <td className="py-2 px-3 text-dgray whitespace-nowrap">{r.riga.codice_modello}</td>
                      <td className="py-2 px-3 text-dgray">
                        {r.voce ? r.voce.descrizione.slice(0, 70) : r.riga.descrizione || <em>prezzo base</em>}
                      </td>
                      <td className="py-2 px-3 text-right text-dgray whitespace-nowrap">
                        {formattaPrezzo(r.prezzoAttuale)}
                      </td>
                      <td className="py-2 px-3 text-right text-dgray whitespace-nowrap">
                        {formattaPrezzo(r.prezzoNuovo)}
                      </td>
                      <td className={`py-2 px-3 whitespace-nowrap ${STATO_COLORE[r.stato]}`}>
                        {STATO_LABEL[r.stato]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={handleConferma} disabled={modificate.length === 0 || applicazione}>
              {applicazione ? 'Applico le modifiche…' : `Conferma ${modificate.length} modifiche di prezzo`}
            </Button>
            {modificate.length === 0 && <span className="text-sm text-dgray/60">Nessun prezzo diverso da applicare.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
