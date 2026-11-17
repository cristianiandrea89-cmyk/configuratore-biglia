import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { modalitaDemo } from './lib/modalitaDemo'
import NavBar from './components/NavBar'
import LoginGate from './components/LoginGate'
import { CurrentUserProvider } from './hooks/useCurrentUser'
import NuovaOffertaPage from './pages/NuovaOffertaPage'
import BozzeOffertePage from './pages/BozzeOffertePage'
import StoricoOffertePage from './pages/StoricoOffertePage'
import OffertaDettaglioPage from './pages/OffertaDettaglioPage'
import OffertaStoricaDettaglioPage from './pages/OffertaStoricaDettaglioPage'
import AggiornaPrezziPage from './pages/AggiornaPrezziPage'

function App() {
  const demo = modalitaDemo()
  // Titolo della scheda del browser diverso in demo: si distingue anche tra più schede aperte.
  useEffect(() => {
    document.title = demo ? 'DEMO · Configuratore Biglia' : 'Configuratore Biglia'
  }, [demo])
  return (
    <LoginGate>
      <CurrentUserProvider>
      <BrowserRouter>
        <NavBar />
        {demo && (
          <div className="bg-dgray py-1.5 text-center text-xs font-bold uppercase tracking-wider text-bronze">
            Modalità presentazione · versione dimostrativa
          </div>
        )}
        <main className="mx-auto max-w-5xl px-5 py-8">
          <Routes>
            <Route path="/" element={<NuovaOffertaPage />} />
            <Route path="/bozze" element={demo ? <Navigate to="/" replace /> : <BozzeOffertePage />} />
            <Route path="/storico" element={demo ? <Navigate to="/" replace /> : <StoricoOffertePage />} />
            <Route path="/offerte/:id" element={<OffertaDettaglioPage />} />
            <Route path="/offerte/:id/modifica" element={<NuovaOffertaPage />} />
            <Route path="/offerte-storiche/:id" element={demo ? <Navigate to="/" replace /> : <OffertaStoricaDettaglioPage />} />
            <Route path="/aggiorna-prezzi" element={demo ? <Navigate to="/" replace /> : <AggiornaPrezziPage />} />
          </Routes>
        </main>
      </BrowserRouter>
      </CurrentUserProvider>
    </LoginGate>
  )
}

export default App
