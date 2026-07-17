import { useEffect, useState } from 'react'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { supabase } from '../lib/supabaseClient'

// Campo "Il tuo nome" mostrato inline nel form: se il nome è già noto (salvato
// in localStorage da un salvataggio precedente su questo dispositivo) mostra
// solo un link per cambiarlo; altrimenti chiede il nome con autocomplete sui
// valori già usati (colonna offerte.creato_da).
export default function NomeUtenteInline() {
  const { utente, setUtente } = useCurrentUser()
  const [modificaAttiva, setModificaAttiva] = useState(!utente)
  const [nomiPrecedenti, setNomiPrecedenti] = useState([])

  useEffect(() => {
    supabase
      .from('offerte')
      .select('creato_da')
      .then(({ data }) => {
        if (!data) return
        const distinti = [...new Set(data.map((r) => r.creato_da).filter(Boolean))]
        setNomiPrecedenti(distinti)
      })
  }, [])

  if (!modificaAttiva) {
    return (
      <p className="text-sm text-dgray/70">
        Inserito da <span className="font-medium text-dgray">{utente}</span>{' '}
        <button type="button" onClick={() => setModificaAttiva(true)} className="text-bronze hover:underline">
          Non sei {utente}? Cambia
        </button>
      </p>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-dgray mb-1">
        Il tuo nome <span className="text-red-600">*</span>
      </label>
      <input
        type="text"
        list="nomi-precedenti"
        defaultValue={utente}
        onChange={(e) => setUtente(e.target.value)}
        onBlur={() => utente.trim() && setModificaAttiva(false)}
        placeholder="Nome e cognome"
        className="w-full max-w-xs border border-gray/40 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-bronze"
      />
      <datalist id="nomi-precedenti">
        {nomiPrecedenti.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}
