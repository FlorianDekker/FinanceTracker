// Draait alle tests/unit/*.test.mjs sequentieel in een eigen Node-proces.
// Elk testbestand krijgt een schone fake-indexeddb; daarom geen gedeeld proces.
// Exit-code 1 zodra één bestand faalt.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REGISTER = path.join(HERE, 'register.mjs')

const only = process.argv.slice(2).filter(a => !a.startsWith('-'))
const bestanden = readdirSync(HERE)
  .filter(f => f.endsWith('.test.mjs'))
  .filter(f => only.length === 0 || only.some(o => f.includes(o)))
  .sort()

if (bestanden.length === 0) {
  console.error('geen testbestanden gevonden')
  process.exit(1)
}

const resultaten = []
for (const bestand of bestanden) {
  const start = Date.now()
  const r = spawnSync(process.execPath, ['--import', REGISTER, path.join(HERE, bestand)], {
    encoding: 'utf8',
    cwd: path.resolve(HERE, '..', '..'),
    timeout: 120_000,
  })
  const uit = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const oks = (uit.match(/^\s*ok /gm) ?? []).length
  const ok = r.status === 0
  resultaten.push({ bestand, ok, oks, ms: Date.now() - start })

  console.log(`\n── ${bestand} ${'─'.repeat(Math.max(0, 58 - bestand.length))}`)
  process.stdout.write(uit.trimEnd() + '\n')
  console.log(`${ok ? 'PASS' : 'FAIL'} ${bestand} — ${oks} checks, ${Date.now() - start} ms${ok ? '' : ` (exit ${r.status ?? r.signal})`}`)
}

const gefaald = resultaten.filter(r => !r.ok)
const totaalOks = resultaten.reduce((s, r) => s + r.oks, 0)
console.log('\n=== samenvatting ===')
for (const r of resultaten) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.bestand.padEnd(22)} ${String(r.oks).padStart(3)} checks  ${String(r.ms).padStart(5)} ms`)
console.log(`\n${resultaten.length - gefaald.length}/${resultaten.length} bestanden groen, ${totaalOks} checks` +
  (gefaald.length ? ` — FAIL: ${gefaald.map(r => r.bestand).join(', ')}` : ''))
process.exit(gefaald.length ? 1 : 0)
