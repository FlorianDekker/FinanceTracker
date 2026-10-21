/**
 * Rekeningen: soorten, totalen en het saldo dat uit de bankimport komt.
 *
 * Een rekening met `source: 'bank-import'` (of de oude waarde `'abn-import'`,
 * zie `isBankImportSource`) heeft geen eigen saldo-invoer: dat
 * saldo komt uit dezelfde berekening als de saldocontrole in Instellingen —
 * het laatste banksaldo uit de import plus wat je daarna handmatig invoerde.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { anchorsPerAccount, expectedBalance, manualSince } from '../balance'
import { round2 } from './months'

export const ACCOUNT_KINDS = [
  { key: 'betaal', label: 'Betaalrekening', icon: '💳' },
  { key: 'spaar', label: 'Spaarrekening', icon: '🏦' },
  { key: 'beleggen', label: 'Beleggingen', icon: '📈' },
  { key: 'overig', label: 'Overig', icon: '📦' },
]

export function kindOf(kind) {
  return ACCOUNT_KINDS.find(k => k.key === kind) ?? ACCOUNT_KINDS[3]
}

/** …1234 — genoeg om je rekeningen uit elkaar te houden. */
export function maskAccount(iban) {
  const s = String(iban ?? '')
  return s.length > 8 ? `…${s.slice(-4)}` : s || 'onbekende rekening'
}

/**
 * Een rekening uit de bankimport had altijd `source: 'abn-import'` — dat
 * heette nog naar de eerste bank die de app ondersteunde. Nu Revolut en
 * Rabobank er ook in komen heet het generiek `'bank-import'`; bestaande rijen
 * met de oude waarde blijven via deze check gewoon werken (geen migratie nodig).
 */
export function isBankImportSource(source) {
  return source === 'bank-import' || source === 'abn-import'
}

/** Vaste sleutel per rekening, zodat een backup-herstel niets hoeft te hernummeren. */
export function importAccountKey(account) {
  return `bank-${String(account ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

/** "Revolut Current" blijft zoals het is; een IBAN wordt een leesbare naam. */
export function labelForAccount(account) {
  const s = String(account ?? '').trim()
  if (/^Revolut\s/i.test(s)) return s
  if (/RABO/i.test(s)) return `Rabobank ${maskAccount(s)}`
  return `Betaalrekening ${maskAccount(s)}`
}

/** Revolut Savings/Rabo spaarrekening -> 'spaar', anders de standaard 'betaal'. */
export function kindForAccount(account) {
  return /savings$/i.test(String(account ?? '').trim()) ? 'spaar' : 'betaal'
}

/**
 * Het verwachte saldo per geïmporteerde rekening.
 * Handmatig ingevoerde transacties hebben geen rekeningnummer; net als bij de
 * saldocontrole tellen die mee bij de rekening met het meest recente anker.
 * @returns { [iban]: { account, balance, anchorDate, manualCount } }
 */
export function importAccountBalances(txs) {
  const ankers = Object.values(anchorsPerAccount(txs))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const uit = {}
  ankers.forEach((anker, i) => {
    const manual = i === 0 ? manualSince(txs, anker) : []
    uit[anker.account] = {
      account: anker.account,
      balance: expectedBalance(anker, manual),
      anchorDate: anker.date,
      manualCount: manual.length,
    }
  })
  return uit
}

/** Alleen wat meetelt: niet gearchiveerd, saldo bekend. */
export function activeAccounts(accounts) {
  return (accounts ?? []).filter(a => a && !a.archived)
}

export function totalWealth(accounts) {
  return round2(activeAccounts(accounts).reduce((s, a) => s + (Number(a.balance) || 0), 0))
}

/** Op volgorde, met de handmatige rekeningen netjes achter elkaar. */
export function sortAccounts(accounts) {
  return [...(accounts ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
