/**
 * Vermogensverloop van de bankrekening(en) zelf, opgebouwd uit de
 * transacties — niet uit de momentopnames. De bankimport (ABN, ING) bewaart
 * bij elke regel het saldo ná die mutatie (`tx.balance`) en de rekening
 * (`tx.account`); daarmee is het verloop met terugwerkende kracht te tekenen,
 * ook over dagen van vóór het eerste bezoek aan het Vermogen-scherm.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { anchorsPerAccount, manualSince, signed } from '../balance'
import { round2 } from './months'

function hasBalance(tx) {
  return tx?.balance != null && Number.isFinite(Number(tx.balance))
}

/**
 * Per rekening (IBAN) een dagreeks van saldi: één punt per dag met minstens
 * één bankmutatie, met het saldo ná de láátste mutatie van die dag (volgorde:
 * datum, dan id — net als `anchorsPerAccount`). Geen doorzet-punten voor
 * dagen zonder mutatie: dat is aan wie de reeks gebruikt (zie
 * `combinedWealthHistory` in `history.js`), en houdt deze reeks klein.
 *
 * Handmatige transacties (zonder `balance`) ná het laatste anker verschuiven
 * het saldo verder, precies zoals de saldocontrole het doet
 * (`expectedBalance` in `src/utils/balance.js`): alleen de rekening met het
 * meest recente anker krijgt ze toegerekend, want zo'n regel heeft zelf geen
 * rekeningnummer (zie `importAccountBalances` in `accounts.js`).
 *
 * @returns { [iban]: [{ date, balance }] } — oplopend op datum, per rekening
 */
export function bankAccountHistories(txs) {
  const alle = txs ?? []
  const ankers = anchorsPerAccount(alle)
  const ibans = Object.keys(ankers).filter(Boolean)
  const nieuwsteIban = ibans
    .slice()
    .sort((a, b) => (ankers[a].date < ankers[b].date ? 1 : ankers[a].date > ankers[b].date ? -1 : 0))[0] ?? null

  const uit = {}
  for (const iban of ibans) {
    // Per dag het saldo ná de laatste bankmutatie van die dag.
    const perDag = new Map()
    for (const tx of alle) {
      if (!hasBalance(tx) || String(tx.account ?? '') !== iban) continue
      const huidig = perDag.get(tx.date)
      if (!huidig || (tx.id ?? 0) >= huidig.id) perDag.set(tx.date, { balance: round2(tx.balance), id: tx.id ?? 0 })
    }
    const reeks = new Map([...perDag.entries()].map(([date, w]) => [date, w.balance]))

    if (iban === nieuwsteIban) {
      const anker = ankers[iban]
      let lopend = anker.balance
      // manualSince sorteert al op datum, dan id: meerdere regels op één dag
      // stapelen dus in de juiste volgorde en de laatste wint vanzelf.
      for (const tx of manualSince(alle, anker)) {
        lopend = round2(lopend + signed(tx))
        reeks.set(tx.date, lopend)
      }
    }

    uit[iban] = [...reeks.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, balance]) => ({ date, balance }))
  }
  return uit
}
