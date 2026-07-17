import { separaTitoloVoce } from '../lib/testoVoce'

function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

export default function VoceOpzionaleRow({
  voce,
  selezionata,
  onToggle,
  disabled,
  attenuata,
  mostraQuantita,
  quantita = 1,
  onQuantitaChange,
}) {
  const { titolo, resto } = separaTitoloVoce(voce.descrizione)
  return (
    <label
      className={`flex items-start gap-3 py-2 px-1 border-b border-gray/20 last:border-b-0 transition-colors cursor-pointer ${
        disabled ? 'opacity-40 cursor-not-allowed' : attenuata ? 'opacity-40 hover:opacity-100' : 'hover:bg-offwhite'
      }`}
    >
      <input
        type="checkbox"
        checked={selezionata}
        disabled={disabled}
        onChange={() => onToggle(voce.id)}
        className="mt-1 accent-bronze w-4 h-4 shrink-0"
      />
      <span className="flex-1 text-sm text-dgray">
        {voce.codice && <span className="text-dgray/60 mr-1">{voce.codice}</span>}
        {titolo && <span className="font-semibold">{titolo} </span>}
        {resto}
        {voce.tipo_prezzo === 'supplemento' && (
          <span className="ml-1.5 text-[10px] uppercase text-bronze">supplemento</span>
        )}
      </span>
      {mostraQuantita && (
        <input
          type="number"
          min="1"
          value={quantita}
          disabled={disabled || !selezionata}
          onClick={(e) => e.preventDefault()}
          onChange={(e) => onQuantitaChange?.(voce.id, e.target.value)}
          className="w-14 shrink-0 border border-gray/40 rounded-sm px-1.5 py-0.5 text-sm text-right disabled:opacity-40 disabled:bg-transparent focus:outline-none focus:border-bronze"
        />
      )}
      <span className="text-sm font-medium text-dgray whitespace-nowrap">{formattaPrezzo(voce.prezzo)}</span>
    </label>
  )
}
