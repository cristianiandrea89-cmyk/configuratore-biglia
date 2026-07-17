import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import offerteStoriche from '../data/offerteStoriche.json'
import { separaTitoloVoce } from '../lib/testoVoce'

function formattaPrezzo(prezzo) {
  if (prezzo === null || prezzo === undefined) return 'n/d'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

function formattaData(iso, soloAnno) {
  if (!iso) return '—'
  if (soloAnno) return iso.slice(0, 4)
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export default function OffertaStoricaDettaglioPage() {
  const { id } = useParams()
  const offerta = offerteStoriche.find((o) => o.id === id)
  const [testo, setTesto] = useState(null)
  const [caricamentoTesto, setCaricamentoTesto] = useState(true)

  useEffect(() => {
    let attivo = true
    // Il testo integrale delle offerte storiche sta in un file a parte (pesante):
    // lo si carica solo qui, all'apertura della scheda, con import dinamico.
    import('../data/offerteStoricheTesti.json')
      .then((mod) => {
        if (attivo) setTesto(mod.default[id] || [])
      })
      .catch(() => {
        if (attivo) setTesto([])
      })
      .finally(() => {
        if (attivo) setCaricamentoTesto(false)
      })
    return () => {
      attivo = false
    }
  }, [id])

  if (!offerta) {
    return (
      <div>
        <p className="text-sm text-dgray/70">Offerta storica non trovata.</p>
        <Link to="/storico" className="mt-4 inline-block text-sm text-bronze hover:underline">
          ← Torna allo storico
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-xs uppercase text-dgray/60">
        <span>Archivio storico</span>
        {offerta.numero && <span>· n. {offerta.numero}</span>}
      </div>
      <h1 className="mt-1 font-heading text-2xl font-extrabold uppercase text-dgray">
        {offerta.cliente} — Biglia {offerta.modello}
      </h1>

      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-dgray">
        <span>
          <span className="text-dgray/60">Data:</span> {formattaData(offerta.data, offerta.dataNota)}
        </span>
        <span>
          <span className="text-dgray/60">Totale:</span>{' '}
          <span className="font-semibold text-bronze">{formattaPrezzo(offerta.totale)}</span>
          {offerta.totale ? ' + IVA' : ''}
        </span>
      </div>

      <p className="mt-3 text-xs text-dgray/60">
        Offerta ricostruita dall'archivio Word aziendale (file: {offerta.file_origine}). Testo di sola consultazione.
      </p>

      <section className="mt-6">
        {caricamentoTesto && <p className="text-sm text-dgray/70">Caricamento testo offerta…</p>}
        {!caricamentoTesto && (!testo || testo.length === 0) && (
          <p className="text-sm text-dgray/60">Testo dell'offerta non disponibile.</p>
        )}
        {!caricamentoTesto && testo && testo.length > 0 && (
          <div className="border border-gray/30 rounded-sm px-4 py-3 bg-white space-y-1.5 text-sm text-dgray">
            {testo.map((riga, i) => {
              const { titolo, resto } = separaTitoloVoce(riga)
              return (
                <p key={i}>
                  {titolo && <span className="font-semibold">{titolo} </span>}
                  {resto}
                </p>
              )
            })}
          </div>
        )}
      </section>

      <Link to="/storico" className="mt-6 inline-block text-sm text-bronze hover:underline">
        ← Torna allo storico
      </Link>
    </div>
  )
}
