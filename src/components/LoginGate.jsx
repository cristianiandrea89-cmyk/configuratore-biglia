import { useState } from 'react'

// Barriera semplice con password condivisa: non è vera autenticazione — la password viene inclusa nel
// bundle JS del sito (visibile a chi lo ispeziona) e il database ha comunque accesso aperto — serve solo a
// tenere fuori i curiosi occasionali. Si sblocca una volta per dispositivo (localStorage).
// La password NON sta nel repository: arriva dalla variabile d'ambiente VITE_ACCESS_PASSWORD (file .env in
// locale, Settings > Environment Variables su Vercel). Se manca, l'accesso resta bloccato.
const PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD
const STORAGE_KEY = 'configuratore_biglia_unlocked'

export default function LoginGate({ children }) {
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
    <div className="min-h-screen flex items-center justify-center bg-dgray px-5">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-full max-w-xs space-y-4">
        <h1 className="font-heading font-extrabold uppercase text-xl text-center">Configuratore Biglia</h1>
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
        {!PASSWORD && <p className="text-sm text-red-600">Accesso non configurato: manca VITE_ACCESS_PASSWORD.</p>}
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
