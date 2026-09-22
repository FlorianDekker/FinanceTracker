import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  BALANCE_CHECKS_SETTING,
  anchorsPerAccount,
  appendCheck,
  expectedBalance,
  manualSince,
} from '../utils/balance'

/**
 * Alles voor de saldocontrole van één rekening. `account` leeg = de rekening
 * met het meest recente anker. Er is geen index op `balance`; de tabel is
 * klein genoeg om één keer door te lopen.
 */
export function useBalanceCheck(account = null) {
  return useLiveQuery(async () => {
    const txs = await db.transactions.toArray()
    const anchors = anchorsPerAccount(txs)
    const accounts = Object.values(anchors).sort((a, b) => (a.date < b.date ? 1 : -1))
    const anchor = (account != null && anchors[account]) || accounts[0] || null
    // Handmatige regels hebben geen rekening; bij meerdere rekeningen tellen
    // ze dus allemaal mee bij de gekozen rekening (zie de kaart voor de uitleg).
    const manual = manualSince(txs, anchor)
    return { anchor, accounts, manual, expected: expectedBalance(anchor, manual) }
  }, [account], null)
}

export async function getBalanceChecks() {
  const row = await db.settings.get(BALANCE_CHECKS_SETTING)
  return Array.isArray(row?.value) ? row.value : []
}

export function useBalanceChecks() {
  return useLiveQuery(getBalanceChecks, [], [])
}

/** Bewaart een uitgevoerde controle (nieuwste vooraan). */
export async function saveBalanceCheck(check) {
  const list = await getBalanceChecks()
  const value = appendCheck(list, { at: Date.now(), ...check })
  await db.settings.put({ key: BALANCE_CHECKS_SETTING, value })
  return value
}

export async function clearBalanceChecks() {
  await db.settings.put({ key: BALANCE_CHECKS_SETTING, value: [] })
}
