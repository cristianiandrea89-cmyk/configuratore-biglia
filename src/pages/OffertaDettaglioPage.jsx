import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchOfferta } from '../lib/offerte'
import { generaWordOfferta } from '../pdf/offertaWord'
import Button from '../components/Button'
import { separaTitoloVoce } from '../lib/testoVoce'

function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

export default function OffertaDettaglioPage() {
  const { id } = useParams()
  const [offerta, setOfferta] = useState(null)
  const [errore, setErrore] = useState(null)
  const [generazioneWord, setGenerazioneWord] = useState(false)

  useEffect(() => {
    fetchOfferta(id)
      .then(setOfferta)
      .catch((e) => setErrore(e.message))
  }, [id])

  async function handleScaricaWord() {
    setGenerazioneWord(true)
    try {
      const blob = await generaWordOfferta(offerta)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Offerta_${offerta.numero}_${offerta.clienti?.ragione_sociale || 'senza-cliente'}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerazioneWord(false)
    }
  }

  if (errore) return <p className="text-sm text-red-600">{errore}</p>
  if (!offerta) return <p className="text-sm text-dgray/70">Caricamento…</p>

  return (
    <div>
      <p className="text-sm text-dgray/60">Offerta n. {offerta.numero}</p>
      <h1 className="font-heading text-2xl font-extrabold uppercase text-dgray">
        {offerta.titolo || offerta.modelli.nome_commerciale}
      </h1>
      <p className="mt-1 text-sm text-dgray">
        Cliente: <span className="font-medium">{offerta.clienti?.ragione_sociale || 'non specificato'}</span>
      </p>
      <p className="text-sm text-dgray/70">Inserito da {offerta.creato_da}</p>

      <div className="mt-4 flex gap-3">
        <Button variant="primary" onClick={handleScaricaWord} disabled={generazioneWord}>
          {generazioneWord ? 'Generazione Word…' : 'Scarica Word'}
        </Button>
        {offerta.stato === 'bozza' && (
          <Link to={`/offerte/${offerta.id}/modifica`}>
            <Button variant="secondary">Continua configurazione</Button>
          </Link>
        )}
      </div>

      <section className="mt-6">
        <h2 className="font-heading text-lg font-bold uppercase text-dgray mb-2">Riepilogo</h2>
        <p className="text-sm text-dgray mb-3">
          Versione: <span className="font-medium">{offerta.modelli.nome_commerciale}</span>
        </p>
        <p className="text-xs uppercase text-dgray/60 mb-1">Accessori aggiunti</p>
        {offerta.voci_selezionate.length === 0 ? (
          <p className="text-sm text-dgray/60">Nessun optional selezionato, solo dotazione standard.</p>
        ) : (
          <ul className="border border-gray/30 rounded-sm divide-y divide-gray/20">
            {offerta.voci_selezionate.map((v) => {
              const { titolo, resto } = separaTitoloVoce(v.descrizione_snapshot)
              return (
                <li key={v.id} className="px-3 py-2 text-sm text-dgray">
                  {v.quantita > 1 && <span className="text-dgray/60 mr-1">N. {v.quantita} ×</span>}
                  {v.codice_snapshot && <span className="text-dgray/60 mr-1">{v.codice_snapshot}</span>}
                  {titolo && <span className="font-semibold">{titolo} </span>}
                  {resto}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 font-heading text-xl font-extrabold text-dgray">
        Totale <span className="text-bronze">{formattaPrezzo(offerta.totale)}</span>
      </div>

      <Link to="/" className="mt-6 inline-block text-sm text-bronze hover:underline">
        ← Nuova offerta
      </Link>
    </div>
  )
}
