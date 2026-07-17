import { useState, useRef, useEffect, useMemo } from 'react'
import { normalizza } from '../lib/normalizza'

export default function ClienteAutocomplete({ clienti, value, onChange, className, placeholder, required }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const testoNormalizzato = normalizza(value.trim())

  const suggerimenti = useMemo(() => {
    if (!testoNormalizzato) return []
    return clienti.filter((c) => normalizza(c.ragione_sociale).includes(testoNormalizzato)).slice(0, 8)
  }, [clienti, testoNormalizzato])

  const esisteEsatto = clienti.some((c) => normalizza(c.ragione_sociale) === testoNormalizzato)

  function handleChange(e) {
    onChange(e.target.value)
    setOpen(true)
  }

  function handleSelect(nome) {
    onChange(nome)
    setOpen(false)
  }

  const mostraDropdown = open && (suggerimenti.length > 0 || (testoNormalizzato && !esisteEsatto))

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        required={required}
        value={value}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {mostraDropdown && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray/40 rounded-sm max-h-56 overflow-auto">
          {suggerimenti.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handleSelect(c.ragione_sociale)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-offwhite transition-colors"
              >
                {c.ragione_sociale}
              </button>
            </li>
          ))}

          {testoNormalizzato && !esisteEsatto && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full text-left px-3 py-2 text-sm text-bronze hover:bg-offwhite transition-colors"
              >
                + Nuovo cliente: "{value.trim()}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
