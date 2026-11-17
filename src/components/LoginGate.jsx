import { useState } from 'react'
import { modalitaDemo } from '../lib/modalitaDemo'
import { CHIAVE_SBLOCCO, CHIAVE_SBLOCCO_DEMO } from '../lib/accesso'

// Barriera semplice con password condivisa: non è vera autenticazione — la password viene inclusa nel
// bundle JS del sito (visibile a chi lo ispeziona) e il database ha comunque accesso aperto — serve solo a
// tenere fuori i curiosi occasionali. Si sblocca una volta per dispositivo (localStorage).
// La password NON sta nel repository: arriva dalla variabile d'ambiente VITE_ACCESS_PASSWORD (file .env in
// locale, Settings > Environment Variables su Vercel). Se manca, l'accesso resta bloccato.
// In modalità presentazione (demo) vale una password DIVERSA, VITE_DEMO_PASSWORD, da dare a chi non è
// dell'azienda (es. Biglia): non sblocca la versione completa e la password interna non va comunicata.
export default function LoginGate({ children }) {
  const demo = modalitaDemo()
  const PASSWORD = demo ? import.meta.env.VITE_DEMO_PASSWORD : import.meta.env.VITE_ACCESS_PASSWORD
  const STORAGE_KEY = demo ? CHIAVE_SBLOCCO_DEMO : CHIAVE_SBLOCCO
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (PASSWORD && input === PASSWORD) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        /* storage non disponibile: si sblocca comunque per questa sessione */
      }
      setUnlocked(true)
    } else {
      setError('Password errata.')
    }
  }

  if (unlocked) return children

  return (
    <div className={`min-h-screen flex items-center justify-center px-5 ${demo ? 'bg-bronze' : 'bg-dgray'}`}>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-full max-w-xs space-y-4">
        <h1 className="font-heading font-extrabold uppercase text-xl text-center">Configuratore Biglia</h1>
        <p className="text-center">
          <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold tracking-wider ${demo ? 'bg-bronze text-dgray' : 'bg-dgray text-offwhite'}`}>
            {demo ? 'ACCESSO DEMO' : 'ACCESSO INTERNO'}
          </span>
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError('')
            }}
            className="w-full border border-gray/40 rounded-sm px-3 py-2 focus:border-bronze outline-none"
          />
        </div>
        {!PASSWORD && <p className="text-sm text-red-600">Accesso non configurato: manca {demo ? 'VITE_DEMO_PASSWORD' : 'VITE_ACCESS_PASSWORD'}.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full bg-bronze text-dgray font-medium rounded-sm py-2 hover:opacity-90 transition-opacity"
        >
          Entra
        </button>
      </form>
    </div>
  )
}
