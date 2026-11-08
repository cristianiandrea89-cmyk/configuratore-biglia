function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

// Righe "etichetta ... importo" tutte con lo stesso font e la stessa grandezza.
const RIGA = 'flex items-baseline justify-between gap-6 font-heading text-lg font-extrabold text-dgray'

// Barra del totale: riga Totale; sotto, la riga Sconto (con il campo %); sotto ancora il Netto riservato.
// `sconto` è facoltativo: { valore, onChange, calcolo } con calcolo = risultato di calcolaSconto o null.
export default function TotaleBar({ totale, sconto, children }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-gray/40 bg-offwhite/95 px-5 py-3 backdrop-blur">
      <div className="w-full max-w-sm space-y-0.5 sm:w-auto sm:min-w-[20rem]">
        <div className={RIGA}>
          <span>Totale</span>
          <span className="text-bronze">{formattaPrezzo(totale)}</span>
        </div>
        {sconto && (
          <div className={RIGA}>
            <label className="flex items-baseline gap-2">
              <span>Sconto</span>
              <input
                type="text"
                inputMode="decimal"
                value={sconto.valore}
                onChange={(e) => sconto.onChange(e.target.value)}
                placeholder="0"
                aria-label="Sconto in percentuale"
                className="w-14 rounded-sm border border-gray/40 bg-white px-1.5 py-0 text-right font-heading text-lg font-extrabold text-dgray focus:border-bronze focus:outline-none"
              />
              <span>%</span>
            </label>
            {sconto.calcolo && <span className="text-bronze">− {formattaPrezzo(sconto.calcolo.importoSconto)}</span>}
          </div>
        )}
        {sconto?.calcolo && (
          <div className={`${RIGA} border-t border-gray/40 pt-0.5`}>
            <span>Netto riservato</span>
            <span className="text-bronze">{formattaPrezzo(sconto.calcolo.netto)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}
