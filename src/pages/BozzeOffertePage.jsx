import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ChevronRight, Eye, Check, X } from 'lucide-react'
import { fetchBozze, eliminaBozza } from '../lib/offerte'

function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

function formattaData(iso) {
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  )
}

export default function BozzeOffertePage() {
  const [bozze, setBozze] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState(null)
  const [eliminazioneId, setEliminazioneId] = useState(null)
  // Id della bozza per cui è comparsa la richiesta di conferma inline (secondo
  // click sul cestino per confermare davvero): niente window.confirm, che nei
  // browser può restare silenziato dopo essere comparso più volte di fila,
  // facendo sembrare che il pulsante non faccia nulla.
  const [confermaId, setConfermaId] = useState(null)

  useEffect(() => {
    fetchBozze()
      .then(setBozze)
      .catch((e) => setErrore(e.message))
      .finally(() => setCaricamento(false))
  }, [])

  async function handleElimina(bozza) {
    setConfermaId(null)
    setEliminazioneId(bozza.id)
    try {
      await eliminaBozza(bozza.id)
      setBozze((prev) => prev.filter((b) => b.id !== bozza.id))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setEliminazioneId(null)
    }
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-extrabold uppercase text-dgray">Bozze</h1>
      <p className="mt-1 text-sm text-dgray/70">
        Configurazioni salvate ma non ancora finalizzate: riprendile in qualsiasi momento da dove le avevi lasciate.
      </p>

      {errore && <p className="mt-3 text-sm text-red-600">{errore}</p>}

      {caricamento && <p className="mt-6 text-sm text-dgray/70">Caricamento…</p>}

      {!caricamento && bozze.length === 0 && (
        <p className="mt-6 text-sm text-dgray/60">Nessuna bozza in sospeso.</p>
      )}

      {!caricamento && bozze.length > 0 && (
        <ul className="mt-6 border border-gray/30 rounded-sm divide-y divide-gray/20">
          {bozze.map((b) => (
            <li key={b.id} className="group flex items-center gap-2 px-3 py-3 hover:bg-bronze/10 transition-colors">
              <Link
                to={`/offerte/${b.id}/modifica`}
                title="Riprendi la configurazione"
                className="flex flex-1 items-center justify-between gap-4 min-w-0 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-dgray truncate">{b.clienti?.ragione_sociale || '—'}</p>
                  <p className="text-dgray/70 truncate">
                    {b.numero} · {b.modelli?.nome_commerciale || '—'} · aggiornata il {formattaData(b.updated_at)}
                  </p>
                </div>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="font-medium text-dgray">{formattaPrezzo(b.totale)}</span>
                  <span className="hidden items-center gap-0.5 font-semibold text-bronze group-hover:flex">
                    Continua
                    <ChevronRight size={16} />
                  </span>
                </span>
              </Link>
              <Link
                to={`/offerte/${b.id}`}
                title="Apri riepilogo"
                className="shrink-0 p-2 text-dgray/50 hover:text-bronze transition-colors"
              >
                <Eye size={16} />
              </Link>
              {confermaId === b.id ? (
                <span className="flex shrink-0 items-center gap-1 text-sm">
                  <span className="text-dgray/70 mr-1">Eliminare?</span>
                  <button
                    type="button"
                    onClick={() => handleElimina(b)}
                    disabled={eliminazioneId === b.id}
                    title="Conferma eliminazione"
                    className="shrink-0 p-1.5 rounded-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfermaId(null)}
                    title="Annulla"
                    className="shrink-0 p-1.5 rounded-sm border border-gray/40 text-dgray hover:bg-offwhite transition-colors"
                  >
                    <X size={16} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfermaId(b.id)}
                  title="Elimina bozza"
                  className="shrink-0 p-2 text-dgray/50 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
