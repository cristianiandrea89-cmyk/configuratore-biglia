import { NavLink } from 'react-router-dom'
import { FilePlus2, FileClock, History, Tags, LogOut } from 'lucide-react'
import { modalitaDemo } from '../lib/modalitaDemo'
import { esci } from '../lib/accesso'

const links = [
  { to: '/', label: 'Nuova offerta', icon: FilePlus2, end: true },
  { to: '/bozze', label: 'Bozze', icon: FileClock },
  { to: '/storico', label: 'Storico', icon: History },
]

export default function NavBar() {
  const demo = modalitaDemo()
  // Modalità presentazione: solo "Nuova offerta" (niente Bozze, Storico, Aggiorna prezzi).
  const voci = demo ? links.filter((l) => l.to === '/') : links
  return (
    <nav className={`sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-5 ${demo ? 'bg-bronze' : 'bg-dgray'}`}>
      <div className={`flex items-center gap-3 font-heading font-extrabold uppercase tracking-wide text-lg whitespace-nowrap ${demo ? 'text-dgray' : 'text-offwhite'}`}>
        <span>
          <span className="sm:hidden">Biglia</span>
          <span className="hidden sm:inline">Configuratore Biglia</span>
        </span>
        {/* Etichetta sempre visibile: si capisce subito in quale versione si è */}
        <span
          className={`rounded-sm px-2 py-0.5 font-body text-[11px] font-bold tracking-wider ${demo ? 'bg-dgray text-bronze' : 'border border-gray/60 text-gray'}`}
        >
          {demo ? 'DEMO' : 'INTERNO'}
        </span>
      </div>
      <div className="flex items-center gap-5 sm:gap-6 overflow-x-auto">
        {voci.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                demo
                  ? isActive
                    ? 'text-dgray font-bold'
                    : 'text-dgray/70 hover:text-dgray'
                  : isActive
                    ? 'text-bronze'
                    : 'text-gray hover:text-bronze'
              }`
            }
          >
            <Icon className="w-7 h-7 sm:w-5 sm:h-5" strokeWidth={1.5} />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
        {!demo && (
        <NavLink
          to="/aggiorna-prezzi"
          className={({ isActive }) =>
            `flex items-center gap-1 text-xs pl-3 ml-1 border-l border-gray/30 whitespace-nowrap transition-colors ${
              isActive ? 'text-bronze' : 'text-gray/60 hover:text-bronze'
            }`
          }
        >
          <Tags className="w-6 h-6 sm:w-4 sm:h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Aggiorna prezzi</span>
        </NavLink>
        )}
        <button
          type="button"
          onClick={esci}
          title="Esci e torna alla schermata della password"
          className={`flex items-center gap-1 text-xs pl-3 ml-1 border-l whitespace-nowrap transition-colors ${
            demo ? 'border-dgray/30 text-dgray/80 hover:text-dgray' : 'border-gray/30 text-gray/70 hover:text-bronze'
          }`}
        >
          <LogOut className="w-6 h-6 sm:w-4 sm:h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Esci</span>
        </button>
      </div>
    </nav>
  )
}
