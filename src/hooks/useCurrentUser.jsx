import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'configuratore_biglia_utente'
const CurrentUserContext = createContext(null)

export function CurrentUserProvider({ children }) {
  const [utente, setUtenteState] = useState(() => localStorage.getItem(STORAGE_KEY) || '')

  const setUtente = useCallback((nome) => {
    localStorage.setItem(STORAGE_KEY, nome)
    setUtenteState(nome)
  }, [])

  return (
    <CurrentUserContext.Provider value={{ utente, setUtente }}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser() {
  return useContext(CurrentUserContext)
}
