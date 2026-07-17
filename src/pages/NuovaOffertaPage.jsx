import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchClienti, trovaOCreaCliente } from '../lib/clienti'
import { fetchModelliAttivi, fetchModelloConVoci, fetchCondizioniStandard } from '../lib/modelli'
import { creaOfferta, aggiornaOfferta, fetchOfferta } from '../lib/offerte'
import { fetchSuggerimentiPerModello, fetchUltimaConfigurazionePerCliente } from '../lib/suggerimenti'
import { normalizza } from '../lib/normalizza'
import { useCurrentUser } from '../hooks/useCurrentUser'
import ClienteAutocomplete from '../components/ClienteAutocomplete'
import VoceOpzionaleRow from '../components/VoceOpzionaleRow'
import TotaleBar from '../components/TotaleBar'
import NomeUtenteInline from '../components/NomeUtenteInline'
import Button from '../components/Button'
import { separaTitoloVoce, separaCaratteristicheTecniche, raggruppaSpecifiche, MACRO_SEZIONE_RE } from '../lib/testoVoce'
import noteVoci from '../data/noteVoci.json'
import { ChevronDown } from 'lucide-react'

// 'Versioni' = solo alternative di mandrino/elettromandrino (es. ASA 6”/ASA 8”),
// che nel Word aprono la sezione optional. Il prezzo 'supplemento' da solo non
// basta: si applica anche ad altre voci (es. TESTINA contropunta) che sono
// normali optional in sequenza, non varianti macchina.
const VERSIONE_MANDRINO_RE = /MANDRINO/i
// Riconosce le sezioni 'ATTREZZI di PRESA MANDRINO ASA X” ...' per estrarne la
// misura (5/6/8), usata per mostrare solo quella del mandrino attivo e
// collassare le altre.
const ASA_NEL_GRUPPO_RE = /ATTREZZI\s+di\s+PRESA\s+MANDRINO.*ASA\s*(\d+)/i
// Sui modelli BMX51/70/80 la stessa frase è 'MANDRINO PRINCIPALE CON
// ELETTROMANDRINO ASA X', non 'mandrino principale ASA X' come su B620/750/1250.
const ASA_BASE_RE = /mandrino principale(?:\s+con\s+elettromandrino)?\s*ASA\s*(\d+)/i

// Estrae {asa, foro} da un breve testo (nome di un gruppo 'Attrezzi di presa'
// o frase introduttiva di una voce Versioni): serve perché lo stesso ASA
// nominale può avere più varianti con cono/alesaggio diverso (es. B750: ASA 8”
// foro 82/95/102,5, ognuna con i propri attrezzi di presa dedicati) — l'ASA da
// solo non basta a distinguerle.
function chiaveAsa(testo) {
  if (!testo) return null
  const asaMatch = testo.match(/ASA\s*(\d+)/i)
  if (!asaMatch) return null
  const foroMatch = testo.match(/foro\s*([\d,]+)/i)
  return { asa: asaMatch[1], foro: foroMatch ? foroMatch[1] : null }
}

// Due chiavi corrispondono se hanno lo stesso ASA; il foro va confrontato solo
// se noto su entrambi i lati (la configurazione di serie, che non lo
// specifica, corrisponde a qualunque foro di quell'ASA).
function chiaviCorrispondono(a, b) {
  if (!a || !b || a.asa !== b.asa) return false
  if (a.foro == null || b.foro == null) return true
  return a.foro === b.foro
}

// Titolo compatto e uniforme per una voce 'Versioni' (es. 'MANDRINO PRINCIPALE
// ASA 6” (foro 71)'), così le alternative si presentano con lo stesso stile
// pulito della configurazione di serie invece del testo lungo del Word
// ('VERSIONI CON MANDRINO PRINCIPALE ASA 6” ELETTROMANDRINO ASA 6” ...').
function titoloVersione(descrizione) {
  const asa = descrizione.match(/ASA\s*(\d+)/i)?.[1]
  const foro = descrizione.match(/foro\s*([\d,]+)/i)?.[1]
  if (!asa) return null
  return `MANDRINO PRINCIPALE ASA ${asa}”${foro ? ` (foro ${foro})` : ''}`
}

function raggruppa(voci) {
  const isVersioneMandrino = (v) => v.categoria === 'optional_macchina' && v.tipo_prezzo === 'supplemento' && VERSIONE_MANDRINO_RE.test(v.descrizione)
  const optionalMacchina = voci.filter((v) => v.categoria === 'optional_macchina' && !isVersioneMandrino(v))
  const versioniAlternative = voci.filter(isVersioneMandrino)
  const accessoriPerGruppo = {}
  voci
    .filter((v) => v.categoria === 'accessori_catalogo')
    .forEach((v) => {
      const gruppo = v.gruppo || 'Altro'
      if (!accessoriPerGruppo[gruppo]) accessoriPerGruppo[gruppo] = []
      accessoriPerGruppo[gruppo].push(v)
    })
  // 'Chiavi di bloccaggio' e 'Adattatori' fanno parte dello stesso blocco
  // 'Mandrinetti motorizzati' nel Master (chiavi/adattatori per i mandrinetti
  // T134): quando c'è una sezione Mandrinetti motorizzati li uniamo lì dentro
  // come sotto-elenco con titolo proprio, invece di tre accordion separati.
  if (accessoriPerGruppo['Mandrinetti motorizzati']) {
    for (const sottogruppo of ['Chiavi di bloccaggio', 'Adattatori']) {
      const vociSottogruppo = accessoriPerGruppo[sottogruppo]
      if (!vociSottogruppo?.length) continue
      const [prima, ...resto] = vociSottogruppo
      accessoriPerGruppo['Mandrinetti motorizzati'].push({ ...prima, _sottotitolo: sottogruppo }, ...resto)
      delete accessoriPerGruppo[sottogruppo]
    }
  }
  return { optionalMacchina, versioniAlternative, accessoriPerGruppo }
}

const CAMPI_CONDIZIONI = [
  ['consegna', 'Consegna'],
  ['resa', 'Resa'],
  ['collaudo', 'Collaudo'],
  ['messa_in_funzione', 'Messa in funzione'],
  ['corso_programmazione', 'Corso di programmazione'],
  ['pagamento', 'Pagamento'],
  ['garanzia', 'Garanzia'],
  ['validita_offerta', "Validità offerta"],
]

export default function NuovaOffertaPage() {
  const navigate = useNavigate()
  const { id: modificaId } = useParams()
  const { utente } = useCurrentUser()

  // Bozza in fase di ripresa (route /offerte/:id/modifica): quando presente,
  // precarica cliente/modello/voci/condizioni e il salvataggio aggiorna
  // l'offerta esistente invece di crearne una nuova.
  const [bozza, setBozza] = useState(null)
  const [bozzaApplicata, setBozzaApplicata] = useState(false)

  const [clienti, setClienti] = useState([])
  const [nomeCliente, setNomeCliente] = useState('')
  const [modelli, setModelli] = useState([])
  const [modelloId, setModelloId] = useState('')
  const [modello, setModello] = useState(null)
  const [selezionate, setSelezionate] = useState(() => new Set())
  // Quantità per voce (solo per gruppi dove ha senso ordinare più pezzi, es.
  // Mandrinetti motorizzati/Extra dotazione): assente = 1, non ogni voce ne ha una.
  const [quantita, setQuantita] = useState(() => new Map())
  const [condizioni, setCondizioni] = useState({})
  const [caricamento, setCaricamento] = useState(false)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState(null)
  // Tutte le sezioni partono collassate alla scelta di un modello: le apre
  // l'utente quando gli serve, non è la pagina a decidere cosa guardare.
  const [composizioneAperta, setComposizioneAperta] = useState(false)
  const [caratteristicheAperte, setCaratteristicheAperte] = useState(false)
  const [optionalAperta, setOptionalAperta] = useState(false)
  const [versioniAperte, setVersioniAperte] = useState(false)
  const [popolariVoci, setPopolariVoci] = useState([])
  const [ultimaConfig, setUltimaConfig] = useState(null)
  const [sezioniAttrezziAperte, setSezioniAttrezziAperte] = useState({})

  useEffect(() => {
    fetchClienti().then(setClienti).catch((e) => setErrore(e.message))
    fetchModelliAttivi().then(setModelli).catch((e) => setErrore(e.message))
    // In modalità modifica le condizioni arrivano dalla bozza stessa (sotto):
    // caricare qui anche quelle standard creerebbe una corsa fra le due
    // risposte, rischiando di sovrascrivere quelle salvate con i default.
    if (!modificaId) {
      fetchCondizioniStandard()
        .then((c) => c && setCondizioni(c))
        .catch((e) => setErrore(e.message))
    }
  }, [modificaId])

  // Carica la bozza da riprendere e precompila cliente/modello: le voci/
  // quantità/condizioni vengono applicate più sotto, quando il modello (con
  // le sue voci_opzionali) è a sua volta caricato.
  useEffect(() => {
    if (!modificaId) return
    fetchOfferta(modificaId)
      .then((o) => {
        setBozza(o)
        setNomeCliente(o.clienti?.ragione_sociale || '')
        setModelloId(o.modello_id)
      })
      .catch((e) => setErrore(e.message))
  }, [modificaId])

  useEffect(() => {
    // Ogni volta che si (ri)sceglie un modello, tutte le sezioni tornano
    // collassate: è l'utente a decidere cosa aprire, non un default della pagina.
    setComposizioneAperta(false)
    setCaratteristicheAperte(false)
    setOptionalAperta(false)
    setVersioniAperte(false)
    setSezioniAttrezziAperte({})
    if (!modelloId) {
      setModello(null)
      setSelezionate(new Set())
      return
    }
    setCaricamento(true)
    fetchModelloConVoci(modelloId)
      .then((m) => {
        setModello(m)
        if (bozza && bozza.modello_id === modelloId && !bozzaApplicata) {
          const idValidi = new Set(m.voci_opzionali.map((v) => v.id))
          const nuoveSelezionate = new Set()
          const nuovaQuantita = new Map()
          for (const v of bozza.voci_selezionate) {
            if (!idValidi.has(v.voce_opzionale_id)) continue
            nuoveSelezionate.add(v.voce_opzionale_id)
            if (v.quantita > 1) nuovaQuantita.set(v.voce_opzionale_id, v.quantita)
          }
          setSelezionate(nuoveSelezionate)
          setQuantita(nuovaQuantita)
          setCondizioni({
            consegna: bozza.consegna,
            resa: bozza.resa,
            collaudo: bozza.collaudo,
            messa_in_funzione: bozza.messa_in_funzione,
            corso_programmazione: bozza.corso_programmazione,
            pagamento: bozza.pagamento,
            garanzia: bozza.garanzia,
            validita_offerta: bozza.validita_offerta,
          })
          setBozzaApplicata(true)
        } else {
          setSelezionate(new Set())
        }
      })
      .catch((e) => setErrore(e.message))
      .finally(() => setCaricamento(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelloId])

  // I suggerimenti hanno bisogno del modello completo (con le voci) per
  // abbinare lo storico: si calcolano quando il modello è caricato, a
  // prescindere dal cliente.
  useEffect(() => {
    if (!modello) {
      setPopolariVoci([])
      return
    }
    fetchSuggerimentiPerModello(modello)
      .then(setPopolariVoci)
      .catch(() => setPopolariVoci([]))
  }, [modello])

  // Cliente già esistente (confronto tollerante su punteggiatura/maiuscole),
  // per suggerire l'ultima configurazione fatta per lui, se c'è.
  const clienteEsistente = useMemo(() => {
    const testo = normalizza(nomeCliente.trim())
    if (!testo) return null
    return clienti.find((c) => normalizza(c.ragione_sociale) === testo) || null
  }, [clienti, nomeCliente])

  useEffect(() => {
    if (!clienteEsistente) {
      setUltimaConfig(null)
      return
    }
    fetchUltimaConfigurazionePerCliente(clienteEsistente.id)
      .then(setUltimaConfig)
      .catch(() => setUltimaConfig(null))
  }, [clienteEsistente])

  function toggleVoce(voceId) {
    setSelezionate((prev) => {
      const next = new Set(prev)
      if (next.has(voceId)) next.delete(voceId)
      else next.add(voceId)
      return next
    })
  }

  function getQuantita(voceId) {
    return quantita.get(voceId) || 1
  }

  function setQuantitaVoce(voceId, valore) {
    const q = Math.max(1, Math.round(Number(valore)) || 1)
    setQuantita((prev) => new Map(prev).set(voceId, q))
  }

  // Le 'Versioni' (alternative di mandrino ASA 6”/8”) sono mutuamente esclusive:
  // il tornio ha un solo mandrino, non ha senso spuntarne più di una insieme.
  function toggleVersione(voceId) {
    setSelezionate((prev) => {
      const next = new Set(prev)
      const giaSelezionata = next.has(voceId)
      versioniAlternative.forEach((v) => next.delete(v.id))
      if (!giaSelezionata) next.add(voceId)
      return next
    })
  }

  const { optionalMacchina, versioniAlternative, accessoriPerGruppo } = useMemo(
    () => raggruppa(modello?.voci_opzionali || []),
    [modello]
  )

  const specificheGruppi = useMemo(
    () => raggruppaSpecifiche(modello?.specifiche_tecniche || []),
    [modello]
  )

  // Note di contesto (es. 'Kit di riduzione ...') da mostrare come riga sopra
  // la voce a cui sono ancorate: mappa 'gruppo|codice' -> testo. Il codice da
  // solo non basta perché lo stesso T012 può comparire in MANDRINO e CONTROTESTA.
  const noteModello = useMemo(() => {
    const mappa = new Map()
    for (const n of noteVoci[modello?.codice] || []) {
      if (n.primaVoceCodice) mappa.set(`${n.gruppo}|${n.primaVoceCodice}`, n.testo)
    }
    return mappa
  }, [modello])

  // Note senza voce-ancora (primaVoceCodice: null): non introducono una voce
  // specifica ma chiudono la sezione (es. l'avvertenza finale sui mandrinetti
  // con refrigerante interno), mostrate in fondo all'elenco del gruppo.
  const noteFineGruppo = useMemo(() => {
    const mappa = new Map()
    for (const n of noteVoci[modello?.codice] || []) {
      if (!n.primaVoceCodice) mappa.set(n.gruppo, n.testo)
    }
    return mappa
  }, [modello])

  const vociSelezionate = useMemo(
    () => (modello?.voci_opzionali || []).filter((v) => selezionate.has(v.id)),
    [modello, selezionate]
  )


  // Misura ASA del mandrino di serie (incluso nella composizione base),
  // indipendente da cosa il cliente abbia eventualmente spuntato in Versioni:
  // serve a mostrare la voce 'di serie' come prima opzione della sezione.
  const asaBase = useMemo(() => modello?.descrizione_base.match(ASA_BASE_RE)?.[1] || null, [modello])

  // Come asaBase, ma con anche il foro quando la frase di composizione base lo
  // specifica (es. B1250: 'mandrino principale ASA 8” foro 95 std.') — senza
  // il foro, un modello con più varianti dello stesso ASA (B1250: foro 95/
  // 102,5; B750: foro 82/95/102,5) risulterebbe erroneamente compatibile con
  // TUTTE quando in realtà solo una è quella di serie.
  const asaBaseChiave = useMemo(() => {
    if (!modello) return null
    const match = modello.descrizione_base.match(ASA_BASE_RE)
    if (!match) return null
    const finestra = modello.descrizione_base.slice(match.index, match.index + 60)
    return chiaveAsa(finestra) || { asa: match[1], foro: null }
  }, [modello])

  const gruppoElettromandrinoBase = useMemo(
    () => specificheGruppi.find((g) => g.gruppo?.toLowerCase() === 'elettromandrino') || null,
    [specificheGruppi]
  )

  // Mandrino attivo: quello di serie, a meno che il cliente non abbia spuntato
  // in 'Versioni' un upgrade ASA diverso — in quel caso gli attrezzi di presa
  // per le altre misure (o per lo stesso ASA ma un foro diverso, es. B750 ASA
  // 8” foro 82/95/102,5) non servono più e vanno collassati.
  const asaAttivo = useMemo(() => {
    const versioneSelezionata = versioniAlternative.find((v) => selezionate.has(v.id))
    if (versioneSelezionata) {
      const intro = versioneSelezionata.descrizione.split(/Caratteristiche tecniche:/i)[0]
      const chiave = chiaveAsa(intro)
      if (chiave) return chiave
    }
    return asaBaseChiave
  }, [asaBaseChiave, versioniAlternative, selezionate])

  useEffect(() => {
    if (!asaAttivo) return
    // Collassa solo le sezioni ASA non più valide: non forza mai l'apertura
    // di quella corrispondente, che resta chiusa finché l'utente non la apre
    // (tutte le voci partono collassate alla scelta di un modello).
    setSezioniAttrezziAperte((prev) => {
      const next = { ...prev }
      Object.keys(accessoriPerGruppo).forEach((gruppo) => {
        if (!ASA_NEL_GRUPPO_RE.test(gruppo)) return
        if (!chiaviCorrispondono(asaAttivo, chiaveAsa(gruppo))) next[gruppo] = false
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asaAttivo, modello])

  // Un attrezzo di presa per una misura (o un foro) diverso da quello attivo
  // non è acquistabile: se il cliente cambia mandrino, le voci già spuntate
  // per la configurazione precedente vanno deselezionate, non solo nascoste.
  useEffect(() => {
    if (!asaAttivo) return
    setSelezionate((prev) => {
      let cambiato = false
      const next = new Set(prev)
      Object.entries(accessoriPerGruppo).forEach(([gruppo, voci]) => {
        if (!ASA_NEL_GRUPPO_RE.test(gruppo)) return
        if (!chiaviCorrispondono(asaAttivo, chiaveAsa(gruppo))) {
          voci.forEach((v) => {
            if (next.delete(v.id)) cambiato = true
          })
        }
      })
      return cambiato ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asaAttivo, modello])

  const totale = useMemo(() => {
    if (!modello) return 0
    const sommaVoci = vociSelezionate.reduce((sum, v) => sum + Number(v.prezzo) * (quantita.get(v.id) || 1), 0)
    return Number(modello.prezzo_base) + sommaVoci
  }, [modello, vociSelezionate, quantita])

  async function handleGenera() {
    if (salvataggio) return
    if (!utente) {
      setErrore('Inserisci il tuo nome per generare l\'offerta.')
      return
    }
    setSalvataggio(true)
    setErrore(null)
    try {
      const clienteId = nomeCliente.trim()
        ? (await trovaOCreaCliente({ ragioneSociale: nomeCliente, creatoDa: utente })).id
        : null
      const payload = {
        clienteId,
        modello,
        vociSelezionate: vociSelezionate.map((v) => ({ ...v, quantita: getQuantita(v.id) })),
        titolo: `Offerta tornio ${modello.nome_commerciale}`,
        condizioni,
      }
      if (modificaId) {
        await aggiornaOfferta(modificaId, payload)
        navigate(`/offerte/${modificaId}`)
      } else {
        const offerta = await creaOfferta({ ...payload, creatoDa: utente })
        navigate(`/offerte/${offerta.id}`)
      }
    } catch (e) {
      setErrore(e.message)
      setSalvataggio(false)
    }
  }

  return (
    <div className="pb-24">
      <h1 className="font-heading text-2xl font-extrabold uppercase text-dgray">
        {modificaId ? 'Modifica offerta' : 'Nuova offerta'}
      </h1>

      {errore && <p className="mt-3 text-sm text-red-600">{errore}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-dgray mb-1">Cliente</label>
          <ClienteAutocomplete
            clienti={clienti}
            value={nomeCliente}
            onChange={setNomeCliente}
            placeholder="Ragione sociale"
            className="w-full border border-gray/40 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-bronze"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-dgray mb-1">Modello</label>
          <select
            value={modelloId}
            onChange={(e) => setModelloId(e.target.value)}
            className="w-full border border-gray/40 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-bronze"
          >
            <option value="">Seleziona un modello…</option>
            {modelli.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome_commerciale}
                {m.sottotitolo ? ` — ${m.sottotitolo}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {caricamento && <p className="mt-6 text-sm text-dgray/70">Caricamento modello…</p>}

      {modello && !caricamento && (popolariVoci.length > 0 || ultimaConfig?.voci?.length > 0) && (
        <section className="mt-8 border border-bronze/40 bg-bronze/5 rounded-sm px-4 py-3">
          <h2 className="font-heading text-sm font-bold uppercase text-dgray mb-2">Suggerimenti</h2>
          {popolariVoci.length > 0 && (
            <div className={ultimaConfig?.voci?.length > 0 ? 'mb-3' : ''}>
              <p className="text-xs text-dgray/70 mb-1.5">Le voci più scelte per questo modello:</p>
              <div className="flex flex-wrap gap-2">
                {popolariVoci.map(({ voce, conteggio, totaleOfferte }) => {
                  const { titolo } = separaTitoloVoce(voce.descrizione)
                  const selezionata = selezionate.has(voce.id)
                  return (
                    <button
                      key={voce.id}
                      type="button"
                      onClick={() => toggleVoce(voce.id)}
                      className={`text-xs px-2 py-1 rounded-sm border transition-colors ${
                        selezionata
                          ? 'bg-bronze text-white border-bronze'
                          : 'border-bronze/50 text-dgray hover:bg-bronze/10'
                      }`}
                    >
                      {titolo || voce.descrizione.slice(0, 30)} · {conteggio}/{totaleOfferte}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {ultimaConfig?.voci?.length > 0 && (
            <div>
              <p className="text-xs text-dgray/70 mb-1.5">Ultima configurazione fatta per questo cliente:</p>
              <ul className="text-xs text-dgray list-disc list-inside space-y-0.5">
                {ultimaConfig.voci.map((v) => {
                  const { titolo, resto } = separaTitoloVoce(v.descrizione_snapshot)
                  return (
                    <li key={v.voce_opzionale_id}>
                      {titolo && <span className="font-semibold">{titolo} </span>}
                      {!titolo && resto.length > 60 ? resto.slice(0, 60) + '…' : resto}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {modello && !caricamento && (
        <div className="mt-8 space-y-8">
          <section>
            <button
              type="button"
              onClick={() => setComposizioneAperta((prev) => !prev)}
              className="w-full flex items-center justify-between mb-2"
            >
              <span className="flex items-center gap-1.5 font-heading text-lg font-bold uppercase text-dgray">
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${composizioneAperta ? '' : '-rotate-90'}`}
                  strokeWidth={2}
                />
                Composizione base
              </span>
              <span className="font-heading text-lg font-extrabold text-bronze">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(modello.prezzo_base)}
              </span>
            </button>
            {composizioneAperta && (
              <div className="border border-gray/30 rounded-sm px-4 py-3 space-y-2 text-sm text-dgray bg-white">
                {modello.descrizione_base
                  .split('\n')
                  .filter(Boolean)
                  .map((riga, i) => {
                    const { titolo, resto } = separaTitoloVoce(riga)
                    return (
                      <p key={i}>
                        {titolo && <span className="font-semibold">{titolo} </span>}
                        {resto}
                      </p>
                    )
                  })}
              </div>
            )}
          </section>

          {(modello.specifiche_tecniche?.length > 0 || modello.macroistruzioni) && (
            <section>
              <button
                type="button"
                onClick={() => setCaratteristicheAperte((prev) => !prev)}
                className="w-full flex items-center gap-1.5 mb-2"
              >
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${caratteristicheAperte ? '' : '-rotate-90'}`}
                  strokeWidth={2}
                />
                <h2 className="font-heading text-lg font-bold uppercase text-dgray">Caratteristiche tecniche</h2>
              </button>
              {caratteristicheAperte && (
                <div className="border border-gray/30 rounded-sm px-4 py-3 bg-white space-y-3">
                  {specificheGruppi.map((g, gi) => (
                    <div key={gi}>
                      {g.gruppo && (
                        <p className="text-sm font-semibold text-dgray uppercase mb-1">{g.gruppo}</p>
                      )}
                      {g.righe.map((s, i) =>
                        s.valore === null ? (
                          <p
                            key={i}
                            className="pl-2 py-1 border-b border-gray/20 last:border-b-0 text-sm font-medium text-dgray"
                          >
                            {s.etichetta}
                          </p>
                        ) : (
                          <div
                            key={i}
                            className="flex items-baseline justify-between gap-4 py-1 pl-2 border-b border-gray/20 last:border-b-0 text-sm"
                          >
                            <span className={`text-dgray ${!g.gruppo ? 'uppercase' : ''}`}>{s.etichetta}</span>
                            <span className="font-medium text-dgray whitespace-nowrap">{s.valore}</span>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                  {modello.macroistruzioni && (
                    <div className="pt-2">
                      {modello.macroistruzioni
                        .split('\n')
                        .filter(Boolean)
                        .map((riga, i) =>
                          MACRO_SEZIONE_RE.test(riga) ? (
                            <p key={i} className="text-sm font-semibold text-dgray uppercase mt-3 mb-1">
                              {riga}
                            </p>
                          ) : (
                            <p key={i} className="text-sm text-dgray py-0.5">
                              {riga}
                            </p>
                          )
                        )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {versioniAlternative.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setVersioniAperte((prev) => !prev)}
                className="w-full flex items-center gap-1.5 mb-2"
              >
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${versioniAperte ? '' : '-rotate-90'}`}
                  strokeWidth={2}
                />
                <h2 className="font-heading text-lg font-bold uppercase text-dgray">Versioni</h2>
              </button>
              {versioniAperte && (
              <div className="border border-gray/30 rounded-sm px-2">
                {asaBase && gruppoElettromandrinoBase && (
                  <div
                    className={`flex items-start gap-3 py-2 px-1 border-b border-gray/20 transition-colors ${
                      asaAttivo && !chiaviCorrispondono(asaAttivo, asaBaseChiave) ? 'opacity-40' : ''
                    }`}
                  >
                    <input type="checkbox" checked disabled className="mt-1 accent-bronze w-4 h-4 shrink-0" />
                    <div className="flex-1 text-sm text-dgray">
                      <p className="font-semibold">
                        <span className="inline-block bg-bronze text-dgray font-medium px-3 py-1 rounded-sm">
                          MANDRINO PRINCIPALE ASA {asaBase}”
                        </span>{' '}
                        <span className="font-normal normal-case text-xs text-dgray">
                          (di serie, incluso nella composizione base)
                        </span>
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {gruppoElettromandrinoBase.righe.map((s, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-4 text-sm">
                            <span className="text-dgray">{s.etichetta}</span>
                            <span className="font-medium text-dgray whitespace-nowrap">{s.valore}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {versioniAlternative.map((v) => {
                  const selezionata = selezionate.has(v.id)
                  // Non attiva sia quando è selezionata un'altra alternativa,
                  // sia quando non è selezionata nessuna (ASA di serie attivo):
                  // un'alternativa è "attiva" solo se è quella spuntata.
                  const nonAttiva = !selezionata
                  const { titolo, resto } = separaTitoloVoce(v.descrizione)
                  const { righe } = separaCaratteristicheTecniche(resto)
                  return (
                    <label
                      key={v.id}
                      className={`flex items-start gap-3 py-2 px-1 border-b border-gray/20 last:border-b-0 transition-colors cursor-pointer ${
                        nonAttiva ? 'opacity-40 hover:opacity-100' : 'hover:bg-offwhite'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selezionata}
                        onChange={() => toggleVersione(v.id)}
                        className="mt-1 accent-bronze w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 text-sm text-dgray">
                        <div className="flex items-baseline justify-between gap-4">
                          <p className="font-semibold">
                            <span className="inline-block bg-bronze text-dgray font-medium px-3 py-1 rounded-sm">
                              {titoloVersione(v.descrizione) || titolo}
                            </span>{' '}
                            <span className="font-normal normal-case text-xs text-dgray">
                              (in alternativa al mandrino di serie)
                            </span>
                            {v.tipo_prezzo === 'supplemento' && (
                              <span className="ml-1.5 text-[10px] uppercase text-bronze">supplemento</span>
                            )}
                          </p>
                          <span className="font-medium text-dgray whitespace-nowrap">
                            {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v.prezzo)}
                          </span>
                        </div>
                        {righe.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {righe.map((s, i) => (
                              <div key={i} className="flex items-baseline justify-between gap-4 text-sm">
                                <span className="text-dgray">{s.etichetta}</span>
                                <span className="font-medium text-dgray whitespace-nowrap">{s.valore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
              )}
            </section>
          )}

          <section>
            <button
              type="button"
              onClick={() => setOptionalAperta((prev) => !prev)}
              className="w-full flex items-center gap-1.5 mb-2"
            >
              <ChevronDown
                className={`w-5 h-5 transition-transform ${optionalAperta ? '' : '-rotate-90'}`}
                strokeWidth={2}
              />
              <h2 className="font-heading text-lg font-bold uppercase text-dgray">Optional macchina</h2>
            </button>
            {optionalAperta && (
              <div className="border border-gray/30 rounded-sm px-2">
                {optionalMacchina.map((v) => (
                  <VoceOpzionaleRow
                    key={v.id}
                    voce={v}
                    selezionata={selezionate.has(v.id)}
                    onToggle={toggleVoce}
                    attenuata={!selezionate.has(v.id)}
                  />
                ))}
                {optionalMacchina.length === 0 && (
                  <p className="py-3 px-1 text-sm text-dgray/60">Nessun optional per questo modello.</p>
                )}
              </div>
            )}
          </section>

          {Object.entries(accessoriPerGruppo).map(([gruppo, voci]) => {
            const isSezioneAttrezzi = ASA_NEL_GRUPPO_RE.test(gruppo)
            const nonCorrispondente =
              isSezioneAttrezzi && asaAttivo && !chiaviCorrispondono(asaAttivo, chiaveAsa(gruppo))
            const aperta = sezioniAttrezziAperte[gruppo] === true
            return (
              <section key={gruppo}>
                <button
                  type="button"
                  onClick={() => setSezioniAttrezziAperte((prev) => ({ ...prev, [gruppo]: !aperta }))}
                  className="w-full flex items-start gap-1.5 mb-2 text-left"
                >
                  <ChevronDown
                    className={`w-5 h-5 mt-0.5 shrink-0 transition-transform ${aperta ? '' : '-rotate-90'}`}
                    strokeWidth={2}
                  />
                  <div className="min-w-0">
                    <h2 className="font-heading text-lg font-bold uppercase text-dgray truncate">{gruppo}</h2>
                    {nonCorrispondente && (
                      <span className="block text-xs text-dgray normal-case font-normal">
                        (non disponibile con il mandrino selezionato)
                      </span>
                    )}
                  </div>
                </button>
                {aperta && (
                  <div className="border border-gray/30 rounded-sm px-2">
                    {voci.map((v) => {
                      // Il gruppo proprio della voce (non quello della sezione in cui
                      // è visualizzata: 'Chiavi di bloccaggio'/'Adattatori' vengono
                      // unite dentro 'Mandrinetti motorizzati', ma le note sono state
                      // generate con il gruppo originale della voce).
                      const nota = v.codice && noteModello.get(`${v.gruppo}|${v.codice}`)
                      return (
                        <Fragment key={v.id}>
                          {v._sottotitolo && (
                            <p className="pt-3 pb-1 px-1 text-xs italic text-dgray/70">{v._sottotitolo}</p>
                          )}
                          {nota && (
                            <p className="pt-3 pb-1 px-1 text-xs italic text-dgray/70">{nota}</p>
                          )}
                          <VoceOpzionaleRow
                            voce={v}
                            selezionata={selezionate.has(v.id)}
                            onToggle={toggleVoce}
                            disabled={nonCorrispondente}
                            mostraQuantita={gruppo === 'Mandrinetti motorizzati' || gruppo === 'Extra dotazione'}
                            quantita={getQuantita(v.id)}
                            onQuantitaChange={setQuantitaVoce}
                          />
                        </Fragment>
                      )
                    })}
                    {noteFineGruppo.get(gruppo) && (
                      <p className="pt-3 pb-1 px-1 text-xs italic text-dgray/70">{noteFineGruppo.get(gruppo)}</p>
                    )}
                  </div>
                )}
              </section>
            )
          })}

          <section>
            <h2 className="font-heading text-lg font-bold uppercase text-dgray mb-2">Condizioni di fornitura</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPI_CONDIZIONI.map(([campo, label]) => (
                <div key={campo}>
                  <label className="block text-sm font-medium text-dgray mb-1">{label}</label>
                  <textarea
                    value={condizioni[campo] || ''}
                    onChange={(e) => setCondizioni((prev) => ({ ...prev, [campo]: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray/40 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-bronze"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <NomeUtenteInline />
          </section>
        </div>
      )}

      {modello && (
        <TotaleBar totale={totale}>
          <Button variant="primary" onClick={handleGenera} disabled={salvataggio}>
            {salvataggio ? 'Salvataggio…' : modificaId ? 'Salva modifiche' : 'Genera offerta'}
          </Button>
        </TotaleBar>
      )}
    </div>
  )
}
