import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchStoricoOfferte } from '../lib/offerte'
import offerteStoriche from '../data/offerteStoriche.json'

function formattaPrezzo(prezzo) {
  if (prezzo === null || prezzo === undefined) return 'n/d'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

function formattaData(iso, soloAnno) {
  if (!iso) return '—'
  if (soloAnno) return iso.slice(0, 4)
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

const STATO_LABEL = {
  bozza: 'Bozza',
  inviata: 'Inviata',
  confermata: 'Confermata',
  persa: 'Persa',
}

const STATO_COLORE = {
  bozza: 'text-dgray/70',
  inviata: 'text-bronze',
  confermata: 'text-green-700',
  persa: 'text-red-600',
}

// Normalizza offerte app (da Supabase) e offerte storiche (archivio Word) in
// una forma comune, così la tabella le mostra insieme ordinate per data.
function normalizzaApp(o) {
  return {
    key: `app-${o.id}`,
    href: `/offerte/${o.id}`,
    numero: o.numero,
    cliente: o.clienti?.ragione_sociale || '—',
    modello: o.modelli?.nome_commerciale || '—',
    totale: o.totale,
    data: o.created_at,
    soloAnno: false,
    stato: STATO_LABEL[o.stato] || o.stato,
    statoColore: STATO_COLORE[o.stato] || 'text-dgray/70',
    creatoDa: o.creato_da,
    archivio: false,
  }
}

function normalizzaStorica(o) {
  return {
    key: `arch-${o.id}`,
    href: `/offerte-storiche/${o.id}`,
    numero: o.numero ? `n.${o.numero}` : 'Apri',
    cliente: o.cliente || '—',
    modello: `Biglia ${o.modello}`,
    totale: o.totale,
    data: o.data,
    soloAnno: Boolean(o.dataNota),
    stato: 'Archivio',
    statoColore: 'text-dgray/50',
    creatoDa: '—',
    archivio: true,
  }
}

export default function StoricoOffertePage() {
  const [offerteApp, setOfferteApp] = useState([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState(null)
  const [ricerca, setRicerca] = useState('')
  const [soloArchivio, setSoloArchivio] = useState('tutte') // 'tutte' | 'app' | 'archivio'
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [annoFiltro, setAnnoFiltro] = useState('')
  const [modelloFiltro, setModelloFiltro] = useState('')

  useEffect(() => {
    fetchStoricoOfferte()
      .then(setOfferteApp)
      .catch((e) => setErrore(e.message))
      .finally(() => setCaricamento(false))
  }, [])

  const tutte = useMemo(() => {
    const app = offerteApp.map(normalizzaApp)
    const storiche = offerteStoriche.map(normalizzaStorica)
    return [...app, ...storiche].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [offerteApp])

  const clientiDistinti = useMemo(
    () => [...new Set(tutte.map((o) => o.cliente))].filter((c) => c && c !== '—').sort((a, b) => a.localeCompare(b)),
    [tutte]
  )

  const anniDistinti = useMemo(
    () => [...new Set(tutte.map((o) => o.data?.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [tutte]
  )

  const modelliDistinti = useMemo(
    () => [...new Set(tutte.map((o) => o.modello))].filter((m) => m && m !== '—').sort((a, b) => a.localeCompare(b)),
    [tutte]
  )

  const filtrate = useMemo(() => {
    const query = ricerca.trim().toLowerCase()
    return tutte.filter((o) => {
      if (soloArchivio === 'bozze' && o.stato !== 'Bozza') return false
      if (soloArchivio === 'archivio' && !o.archivio) return false
      if (clienteFiltro && o.cliente !== clienteFiltro) return false
      if (annoFiltro && o.data?.slice(0, 4) !== annoFiltro) return false
      if (modelloFiltro && o.modello !== modelloFiltro) return false
      if (!query) return true
      return (
        o.numero.toLowerCase().includes(query) ||
        o.cliente.toLowerCase().includes(query) ||
        o.modello.toLowerCase().includes(query)
      )
    })
  }, [tutte, ricerca, soloArchivio, clienteFiltro, annoFiltro, modelloFiltro])

  const nApp = tutte.filter((o) => !o.archivio).length
  const nArchivio = tutte.filter((o) => o.archivio).length

  return (
    <div>
      <h1 className="font-heading text-2xl font-extrabold uppercase text-dgray">Storico offerte</h1>
      <p className="mt-1 text-sm text-dgray/70">
        {nApp} create nell'app · {nArchivio} dall'archivio storico Biglia
      </p>

      {errore && <p className="mt-3 text-sm text-red-600">{errore}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca per numero, cliente o modello…"
          className="flex-1 min-w-[220px] max-w-sm border border-gray/40 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-bronze"
        />
        <select
          value={clienteFiltro}
          onChange={(e) => setClienteFiltro(e.target.value)}
          className="border border-gray/40 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-bronze max-w-[220px]"
        >
          <option value="">Tutti i clienti ({clientiDistinti.length})</option>
          {clientiDistinti.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={modelloFiltro}
          onChange={(e) => setModelloFiltro(e.target.value)}
          className="border border-gray/40 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-bronze max-w-[220px]"
        >
          <option value="">Tutti i modelli</option>
          {modelliDistinti.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={annoFiltro}
          onChange={(e) => setAnnoFiltro(e.target.value)}
          className="border border-gray/40 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-bronze"
        >
          <option value="">Tutti gli anni</option>
          {anniDistinti.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-sm">
          {[
            ['tutte', 'Tutte'],
            ['bozze', 'Bozze'],
            ['archivio', 'Archivio'],
          ].map(([valore, label]) => (
            <button
              key={valore}
              type="button"
              onClick={() => setSoloArchivio(valore)}
              className={`px-3 py-1.5 rounded-sm border transition-colors ${
                soloArchivio === valore
                  ? 'bg-dgray text-offwhite border-dgray'
                  : 'border-gray/40 text-dgray hover:bg-offwhite'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {caricamento && <p className="mt-6 text-sm text-dgray/70">Caricamento…</p>}

      {!caricamento && filtrate.length === 0 && (
        <p className="mt-6 text-sm text-dgray/60">Nessuna offerta corrisponde ai filtri.</p>
      )}

      {!caricamento && filtrate.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray/30 text-left text-xs uppercase text-dgray/60">
                <th className="py-2 pr-4 font-medium">Numero</th>
                <th className="py-2 pr-4 font-medium">Cliente</th>
                <th className="py-2 pr-4 font-medium">Modello</th>
                <th className="py-2 pr-4 font-medium text-right">Totale</th>
                <th className="py-2 pr-4 font-medium">Stato</th>
                <th className="py-2 pr-4 font-medium">Inserito da</th>
                <th className="py-2 pr-4 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtrate.map((o) => (
                <tr key={o.key} className="border-b border-gray/20 hover:bg-offwhite">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <Link to={o.href} className="text-bronze hover:underline font-medium">
                      {o.numero}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-dgray">{o.cliente}</td>
                  <td className="py-2 pr-4 text-dgray">{o.modello}</td>
                  <td className="py-2 pr-4 text-right font-medium text-dgray whitespace-nowrap">
                    {formattaPrezzo(o.totale)}
                  </td>
                  <td className={`py-2 pr-4 whitespace-nowrap ${o.statoColore}`}>{o.stato}</td>
                  <td className="py-2 pr-4 text-dgray/70">{o.creatoDa}</td>
                  <td className="py-2 pr-4 text-dgray/70 whitespace-nowrap">{formattaData(o.data, o.soloAnno)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
