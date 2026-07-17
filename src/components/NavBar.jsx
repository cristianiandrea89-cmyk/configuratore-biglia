import { NavLink } from 'react-router-dom'
import { FilePlus2, FileClock, History, Tags } from 'lucide-react'

const links = [
  { to: '/', label: 'Nuova offerta', icon: FilePlus2, end: true },
  { to: '/bozze', label: 'Bozze', icon: FileClock },
  { to: '/storico', label: 'Storico', icon: History },
]

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-dgray px-4 py-4 sm:px-5">
      <div className="font-heading font-extrabold uppercase tracking-wide text-offwhite text-lg whitespace-nowrap">
        <span className="sm:hidden">Biglia</span>
        <span className="hidden sm:inline">Configuratore Biglia</span>
      </div>
      <div className="flex items-center gap-5 sm:gap-6 overflow-x-auto">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? 'text-bronze' : 'text-gray hover:text-bronze'
              }`
            }
          >
            <Icon className="w-7 h-7 sm:w-5 sm:h-5" strokeWidth={1.5} />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
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
      </div>
    </nav>
  )
}
