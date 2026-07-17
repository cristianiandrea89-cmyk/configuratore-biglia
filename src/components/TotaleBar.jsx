function formattaPrezzo(prezzo) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(prezzo)
}

export default function TotaleBar({ totale, children }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray/40 bg-offwhite/95 px-5 py-4 backdrop-blur">
      <div className="font-heading text-xl font-extrabold text-dgray">
        Totale <span className="text-bronze">{formattaPrezzo(totale)}</span>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}
