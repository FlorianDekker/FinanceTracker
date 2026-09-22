import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { today } from '../utils/formatters'
import { parseBalanceInput } from '../utils/balance'
import { importAccountBalances, importAccountKey, maskAccount, sortAccounts } from '../utils/wealth/accounts'
import { monthOf, round2 } from '../utils/wealth/months'

/* ------------------------------------------------------------------ *
 * Instellingen: buffer en hoe ver de projectie vooruit kijkt.          *
 * Altijd via deze helpers lezen/schrijven, nooit rechtstreeks.         *
 * ------------------------------------------------------------------ */

export const WEALTH_BUFFER_SETTING = 'wealthBuffer'
export const WEALTH_PROJECTION_SETTING = 'wealthProjectionMonths'
export const DEFAULT_BUFFER = 1000
export const DEFAULT_PROJECTION_MONTHS = 24

/**
 * Bedragen mogen ook als tekst binnenkomen ("1.250,50"): de formulieren houden
 * de ruwe invoer vast zodat een komma gewoon mag. Zie parseBalanceInput.
 */
function bedrag(waarde) {
  return round2(typeof waarde === 'string' ? (parseBalanceInput(waarde) ?? 0) : waarde)
}

async function getNumberSetting(key, standaard) {
  const rij = await db.settings.get(key)
  const waarde = Number(rij?.value)
  return Number.isFinite(waarde) ? waarde : standaard
}

export function useWealthBuffer() {
  return useLiveQuery(() => getNumberSetting(WEALTH_BUFFER_SETTING, DEFAULT_BUFFER), [], DEFAULT_BUFFER)
}

export async function setWealthBuffer(amount) {
  const value = Math.max(0, bedrag(amount))
  await db.settings.put({ key: WEALTH_BUFFER_SETTING, value })
  return value
}

export function useProjectionMonths() {
  return useLiveQuery(
    () => getNumberSetting(WEALTH_PROJECTION_SETTING, DEFAULT_PROJECTION_MONTHS),
    [], DEFAULT_PROJECTION_MONTHS,
  )
}

export async function setProjectionMonths(months) {
  const value = Math.max(3, Math.min(60, Math.round(Number(months) || DEFAULT_PROJECTION_MONTHS)))
  await db.settings.put({ key: WEALTH_PROJECTION_SETTING, value })
  return value
}

/* ------------------------------------------------------------------ *
 * Rekeningen                                                           *
 * ------------------------------------------------------------------ */

/**
 * Alle rekeningen op volgorde. Rekeningen met `source: 'abn-import'` krijgen
 * hun saldo uit de bankimport (zelfde rekensom als de saldocontrole), de rest
 * houdt het saldo dat je zelf invoerde.
 */
export function useAccounts() {
  return useLiveQuery(async () => {
    const rijen = sortAccounts(await db.accounts.toArray())
    if (!rijen.some(a => a.source === 'abn-import')) return rijen
    const saldi = importAccountBalances(await db.transactions.toArray())
    return rijen.map(a => {
      const uitImport = a.source === 'abn-import' ? saldi[a.account] : null
      if (!uitImport || uitImport.balance == null) return a
      return { ...a, balance: uitImport.balance, balanceAt: uitImport.anchorDate, fromImport: uitImport }
    })
  }, [], null)
}

async function nextOrder() {
  const rijen = await db.accounts.toArray()
  return rijen.reduce((max, r) => Math.max(max, r.order ?? 0), -1) + 1
}

/**
 * Maakt bij het eerste bezoek een rekening aan voor elke bankrekening die in
 * de import voorkomt. Bestaande rekeningen blijven ongemoeid — je mag ze
 * hernoemen of archiveren zonder dat ze terugkomen.
 * @returns het aantal nieuw aangemaakte rekeningen
 */
export async function ensureImportAccounts() {
  const txs = await db.transactions.toArray()
  const saldi = importAccountBalances(txs)
  const ibans = Object.keys(saldi).filter(Boolean)
  if (!ibans.length) return 0

  const bestaand = await db.accounts.toArray()
  const bekend = new Set(bestaand.map(a => a.key))
  let order = bestaand.reduce((max, r) => Math.max(max, r.order ?? 0), -1) + 1

  const nieuw = []
  for (const iban of ibans) {
    const key = importAccountKey(iban)
    if (bekend.has(key)) continue
    nieuw.push({
      key,
      name: `Betaalrekening ${maskAccount(iban)}`,
      kind: 'betaal',
      order: order++,
      source: 'abn-import',
      account: iban,
      balance: saldi[iban].balance,
      balanceAt: saldi[iban].anchorDate,
      archived: false,
    })
  }
  if (nieuw.length) await db.accounts.bulkPut(nieuw)
  return nieuw.length
}

export async function addAccount({ name, kind = 'spaar', balance = 0, balanceAt = null }) {
  const label = String(name ?? '').trim()
  if (!label) throw new Error('Geef de rekening een naam.')
  const bestaand = new Set((await db.accounts.toArray()).map(a => a.key))
  let key = `eigen-${Date.now().toString(36)}`
  while (bestaand.has(key)) key += 'x'
  const datum = balanceAt || today()
  await db.accounts.put({
    key,
    name: label,
    kind,
    order: await nextOrder(),
    source: 'manual',
    account: null,
    balance: bedrag(balance),
    balanceAt: datum,
    archived: false,
  })
  await upsertSnapshot(key, datum, balance)
  return key
}

export async function updateAccount(key, changes) {
  return db.accounts.update(key, changes)
}

/** Saldo bijwerken: de rekening én de momentopname van die dag. */
export async function setAccountBalance(key, balance, date = today()) {
  await db.accounts.update(key, { balance: bedrag(balance), balanceAt: date })
  await upsertSnapshot(key, date, balance)
}

export async function archiveAccount(key, archived = true) {
  return db.accounts.update(key, { archived })
}

/** Weg is weg: de rekening én zijn hele verloop. */
export async function deleteAccount(key) {
  return db.transaction('rw', db.accounts, db.accountSnapshots, async () => {
    await db.accountSnapshots.where('accountKey').equals(key).delete()
    await db.accounts.delete(key)
  })
}

/* ------------------------------------------------------------------ *
 * Momentopnames                                                        *
 * ------------------------------------------------------------------ */

/** Eén meting per rekening per dag; een tweede meting op dezelfde dag wint. */
export async function upsertSnapshot(accountKey, date, balance) {
  if (balance == null || !Number.isFinite(Number(balance))) return null
  const bestaand = await db.accountSnapshots.where('[accountKey+date]').equals([accountKey, date]).first()
  const rij = { accountKey, date, balance: bedrag(balance) }
  if (bestaand) {
    await db.accountSnapshots.update(bestaand.id, rij)
    return bestaand.id
  }
  return db.accountSnapshots.add(rij)
}

/**
 * Legt het vermogen van vandaag vast. Draait elke keer dat het scherm opent;
 * omdat het een upsert per dag is, groeit de tabel met hooguit één rij per
 * rekening per dag.
 */
export async function snapshotToday(accounts) {
  const datum = today()
  for (const a of accounts ?? []) {
    if (a.archived) continue
    await upsertSnapshot(a.key, datum, a.balance)
  }
  return datum
}

/**
 * Wat er bij het openen van het scherm moet gebeuren: ontbrekende
 * bankrekeningen aanmaken en de stand van vandaag vastleggen. Leest de
 * rekeningen daarna opnieuw, zodat een net aangemaakte rekening meteen zijn
 * eerste meetpunt krijgt.
 */
export async function initWealth() {
  const nieuw = await ensureImportAccounts()
  const rijen = await db.accounts.toArray()
  const saldi = rijen.some(a => a.source === 'abn-import')
    ? importAccountBalances(await db.transactions.toArray())
    : {}
  await snapshotToday(rijen.map(a => {
    const uitImport = a.source === 'abn-import' ? saldi[a.account] : null
    return uitImport?.balance == null ? a : { ...a, balance: uitImport.balance }
  }))
  return nieuw
}

export function useSnapshots() {
  return useLiveQuery(() => db.accountSnapshots.toArray(), [], null)
}

/* ------------------------------------------------------------------ *
 * Reserveringen                                                        *
 * ------------------------------------------------------------------ */

export function useReservations() {
  return useLiveQuery(() => db.reservations.toArray(), [], null)
}

export async function addReservation({ name, amount, dueMonth = null, note = '', category = '' }) {
  const label = String(name ?? '').trim()
  if (!label) throw new Error('Geef de reservering een naam.')
  return db.reservations.add({
    name: label,
    amount: bedrag(amount),
    dueMonth: dueMonth || null,
    note: String(note ?? ''),
    done: false,
    doneAt: null,
    category: String(category ?? ''),
  })
}

export async function updateReservation(id, changes) {
  const patch = { ...changes }
  if ('amount' in patch) patch.amount = bedrag(patch.amount)
  if ('dueMonth' in patch) patch.dueMonth = patch.dueMonth || null
  return db.reservations.update(id, patch)
}

/** Afvinken laat de rij staan (doorgestreept), zodat je hem terug kunt zetten. */
export async function toggleReservationDone(reservation) {
  const done = !reservation?.done
  return db.reservations.update(reservation.id, { done, doneAt: done ? Date.now() : null })
}

export async function deleteReservation(id) {
  return db.reservations.delete(id)
}

/* ------------------------------------------------------------------ *
 * Spaardoelen                                                          *
 * ------------------------------------------------------------------ */

export function useGoals() {
  return useLiveQuery(() => db.goals.orderBy('order').toArray(), [], null)
}

export async function addGoal({ name, icon = '🎯', target, rule, startMonth = null }) {
  const label = String(name ?? '').trim()
  if (!label) throw new Error('Geef het spaardoel een naam.')
  const rijen = await db.goals.toArray()
  return db.goals.add({
    name: label,
    icon: icon || '🎯',
    target: bedrag(target),
    order: rijen.reduce((max, r) => Math.max(max, r.order ?? 0), -1) + 1,
    rule: rule ?? { type: 'surplus' },
    startMonth: startMonth || monthOf(),
    manualDeposits: [],
    reached: false,
    reachedAt: null,
  })
}

export async function updateGoal(id, changes) {
  const patch = { ...changes }
  if ('target' in patch) patch.target = bedrag(patch.target)
  return db.goals.update(id, patch)
}

export async function deleteGoal(id) {
  return db.goals.delete(id)
}

/** Eén plek omhoog of omlaag; de waterval volgt deze volgorde. */
export async function moveGoal(id, richting) {
  return db.transaction('rw', db.goals, async () => {
    const rijen = (await db.goals.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const i = rijen.findIndex(g => g.id === id)
    const j = i + (richting < 0 ? -1 : 1)
    if (i < 0 || j < 0 || j >= rijen.length) return false
    // Hernummeren in één keer: oude rijen kunnen dezelfde order hebben.
    const volgorde = [...rijen]
    volgorde[i] = rijen[j]
    volgorde[j] = rijen[i]
    await Promise.all(volgorde.map((g, k) => db.goals.update(g.id, { order: k })))
    return true
  })
}

/** Een storting buiten de maandregel om (bonus, verjaardagsgeld). */
export async function addManualDeposit(goalId, { date = today(), amount, note = '' }) {
  const waarde = bedrag(amount)
  if (!waarde) throw new Error('Vul een bedrag in.')
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(goalId)
    if (!goal) return null
    const lijst = Array.isArray(goal.manualDeposits) ? goal.manualDeposits : []
    await db.goals.update(goalId, {
      manualDeposits: [...lijst, { date, amount: waarde, note: String(note ?? '') }],
    })
    return waarde
  })
}

export async function removeManualDeposit(goalId, index) {
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(goalId)
    const lijst = Array.isArray(goal?.manualDeposits) ? goal.manualDeposits : []
    if (index < 0 || index >= lijst.length) return false
    await db.goals.update(goalId, { manualDeposits: lijst.filter((_, i) => i !== index) })
    return true
  })
}
