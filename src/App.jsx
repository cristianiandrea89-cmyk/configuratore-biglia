import { BrowserRouter, Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import { CurrentUserProvider } from './hooks/useCurrentUser'
import NuovaOffertaPage from './pages/NuovaOffertaPage'
import BozzeOffertePage from './pages/BozzeOffertePage'
import StoricoOffertePage from './pages/StoricoOffertePage'
import OffertaDettaglioPage from './pages/OffertaDettaglioPage'
import OffertaStoricaDettaglioPage from './pages/OffertaStoricaDettaglioPage'
import AggiornaPrezziPage from './pages/AggiornaPrezziPage'

function App() {
  return (
    <CurrentUserProvider>
      <BrowserRouter>
        <NavBar />
        <main className="mx-auto max-w-5xl px-5 py-8">
          <Routes>
            <Route path="/" element={<NuovaOffertaPage />} />
            <Route path="/bozze" element={<BozzeOffertePage />} />
            <Route path="/storico" element={<StoricoOffertePage />} />
            <Route path="/offerte/:id" element={<OffertaDettaglioPage />} />
            <Route path="/offerte/:id/modifica" element={<NuovaOffertaPage />} />
            <Route path="/offerte-storiche/:id" element={<OffertaStoricaDettaglioPage />} />
            <Route path="/aggiorna-prezzi" element={<AggiornaPrezziPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </CurrentUserProvider>
  )
}

export default App
