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
  return (
    <LoginGate>
      <CurrentUserProvider>
      <BrowserRouter>
        <NavBar />
        {demo && (
          <div className="bg-bronze py-1 text-center text-xs font-medium text-dgray">Modalità presentazione</div>
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
