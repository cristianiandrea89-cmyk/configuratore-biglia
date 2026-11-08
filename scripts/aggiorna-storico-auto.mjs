// Controllo automatico (da pianificare ogni giorno): aggiorna l'archivio Storico con le offerte Biglia nuove e,
// SOLO se è cambiato qualcosa, fa commit e push dei tre file dati (src/data/*) — Vercel poi ripubblica da solo.
//
// Uso:  node scripts/aggiorna-storico-auto.mjs [--senza-push]
// Sicurezze: lavora solo se si è sul ramo main e sincronizzato con origin; committa SOLO i file dell'archivio
// (mai altre modifiche in corso); scrive un riepilogo in scripts/aggiorna-storico.log.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const SENZA_PUSH = process.argv.includes('--senza-push')
const FILE_DATI = ['scripts/storico-ignorati.json', 'src/data/offerteStoriche.json', 'src/data/offerteStoricheTesti.json', 'src/data/suggerimentiStorici.json']
const LOG = 'scripts/aggiorna-storico.log'

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const log = (m) => {
  const riga = `${new Date().toISOString().replace('T', ' ').slice(0, 19)}  ${m}`
  console.log(riga)
  appendFileSync(LOG, riga + '\n')
}

try {
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
    log('SALTATO: non si è sul ramo main')
    process.exit(0)
  }
  git('fetch', 'origin', 'main')
  if (git('rev-list', '--count', 'HEAD..origin/main') !== '0') {
    log('SALTATO: il ramo locale è indietro rispetto a origin/main (fare prima un pull)')
    process.exit(0)
  }

  // aggiorna l'archivio (output dello script incluso nel log solo come riepilogo)
  const out = execFileSync('node', ['scripts/aggiorna-storico.mjs'], { encoding: 'utf8', timeout: 25 * 60 * 1000 })
  const nuove = [...out.matchAll(/^\s+\+ (.+)$/gm)].map((m) => m[1])
  const riepilogo = out.trim().split('\n').pop()

  if (git('status', '--porcelain', '--', ...FILE_DATI) === '') {
    log(`nessuna novità. ${riepilogo}`)
    process.exit(0)
  }
  git('add', '--', ...FILE_DATI)
  git('commit', '-m', `Storico: ${nuove.length} offerte Biglia aggiunte (aggiornamento automatico)\n\n${nuove.map((n) => '- ' + n).join('\n')}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, '--', ...FILE_DATI)
  if (!SENZA_PUSH) git('push', 'origin', 'main')
  log(`AGGIORNATO${SENZA_PUSH ? ' (senza push)' : ' e pubblicato'}: ${nuove.length} nuove -> ${nuove.join(' | ')}`)
} catch (e) {
  log(`ERRORE: ${String(e.message).split('\n')[0].slice(0, 200)}`)
  process.exit(1)
}
