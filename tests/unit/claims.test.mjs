import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const C = await import(`${SRC}/utils/claims.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const debit = (extra = {}) => ({ date: '2026-09-01', amount: 25, type: 'debit', category: 'reiskosten', ...extra })
const credit = (extra = {}) => ({ date: '2026-09-20', amount: 300, type: 'credit', category: 'salaris', ...extra })

// --- claimStatusOf -------------------------------------------------------
t('claimStatusOf verdraagt ontbrekende en onzinnige waarden', () => {
  assert.equal(C.claimStatusOf(debit()), null)
  assert.equal(C.claimStatusOf(debit({ claimStatus: undefined })), null)
  assert.equal(C.claimStatusOf(debit({ claimStatus: 'open' })), 'open')
  assert.equal(C.claimStatusOf(debit({ claimStatus: 'onzin' })), null)
  assert.equal(C.claimStatusOf(undefined), null)
})

// --- isOpenClaim / isClaim / isPayout ------------------------------------
t('open/submitted/paid lopen nog, rejected en payout niet', () => {
  for (const s of ['open', 'submitted', 'paid']) {
    assert.equal(C.isOpenClaim(debit({ claimStatus: s })), true, s)
  }
  assert.equal(C.isOpenClaim(debit({ claimStatus: 'rejected' })), false)
  assert.equal(C.isOpenClaim(debit()), false)
  assert.equal(C.isPayout(credit({ claimStatus: 'payout' })), true)
  assert.equal(C.isClaim(credit({ claimStatus: 'payout' })), false)
  assert.equal(C.isClaim(debit({ claimStatus: 'rejected' })), true)
  assert.equal(C.isClaim(debit()), false)
})

// --- meetellen -----------------------------------------------------------
t('afgekeurde declaratie telt weer mee als uitgave, lopende niet', () => {
  assert.equal(C.isCountedExpense(debit()), true)
  assert.equal(C.isCountedExpense(debit({ claimStatus: 'open' })), false)
  assert.equal(C.isCountedExpense(debit({ claimStatus: 'submitted' })), false)
  assert.equal(C.isCountedExpense(debit({ claimStatus: 'paid' })), false)
  assert.equal(C.isCountedExpense(debit({ claimStatus: 'rejected' })), true)
  assert.equal(C.isCountedExpense(credit()), false, 'een bijschrijving is geen uitgave')
})

t('de bulkbetaling van werk telt niet als inkomen', () => {
  assert.equal(C.isCountedIncome(credit()), true)
  assert.equal(C.isCountedIncome(credit({ claimStatus: 'payout' })), false)
  assert.equal(C.isCountedIncome(debit()), false)
})

t('countsInTotals/onlyCounted als enig filter voor alle totalen', () => {
  assert.equal(C.countsInTotals(debit()), true)
  assert.equal(C.countsInTotals(debit({ claimStatus: 'rejected' })), true)
  assert.equal(C.countsInTotals(debit({ claimStatus: 'open' })), false)
  assert.equal(C.countsInTotals(credit({ claimStatus: 'payout' })), false)
  assert.deepEqual(
    C.onlyCounted([debit(), debit({ claimStatus: 'open' }), credit({ claimStatus: 'payout' })]),
    [debit()],
  )
})

// --- labels --------------------------------------------------------------
t('Nederlandse labels voor elke status', () => {
  assert.deepEqual(C.CLAIM_STATUS_LABELS, {
    open: 'Open', submitted: 'Ingediend', paid: 'Uitbetaald', rejected: 'Afgekeurd', payout: 'Uitbetaling',
  })
  assert.deepEqual(C.CLAIM_STATUSES.slice().sort(), ['open', 'paid', 'payout', 'rejected', 'submitted'])
})

// --- ouderdom ------------------------------------------------------------
const now = new Date('2026-09-14T12:00:00')
t('claimAgeMonths telt volledige maanden', () => {
  assert.equal(C.claimAgeMonths({ date: '2026-09-01' }, now), 0)
  assert.equal(C.claimAgeMonths({ date: '2026-08-01' }, now), 1)
  assert.equal(C.claimAgeMonths({ date: '2026-03-14' }, now), 6)
  assert.equal(C.claimAgeMonths({ date: '2026-03-15' }, now), 5, 'dag telt mee')
  assert.equal(C.claimAgeMonths({ date: '2025-09-30' }, now), 11)
  assert.equal(C.claimAgeMonths({ date: 'geen datum' }, now), 0)
})

t('isExpiringSoon waarschuwt vanaf een maand voor de vervaltermijn', () => {
  assert.equal(C.isExpiringSoon({ date: '2026-09-01', claimStatus: 'open' }, 6, now), false)
  assert.equal(C.isExpiringSoon({ date: '2026-04-01', claimStatus: 'open' }, 6, now), true, '5 maanden oud, termijn 6')
  assert.equal(C.isExpiringSoon({ date: '2026-05-01', claimStatus: 'open' }, 6, now), false, '4 maanden oud')
  assert.equal(C.isExpiringSoon({ date: '2026-04-01', claimStatus: 'submitted' }, 6, now), false, 'al ingediend')
  assert.equal(C.isExpiringSoon({ date: '2026-08-01', claimStatus: 'open' }, 2, now), true, 'korte termijn')
})

// --- openstaand totaal ---------------------------------------------------
t('outstandingClaims = open + ingediend', () => {
  const list = [
    debit({ amount: 25, claimStatus: 'open' }),
    debit({ amount: 40, claimStatus: 'submitted' }),
    debit({ amount: 10, claimStatus: 'paid' }),
    debit({ amount: 99, claimStatus: 'rejected' }),
    debit({ amount: 5 }),
    credit({ amount: 65, claimStatus: 'payout' }),
  ]
  assert.deepEqual(C.outstandingClaims(list), { total: 65, count: 2 })
  assert.deepEqual(C.outstandingClaims([]), { total: 0, count: 0 })
  assert.deepEqual(C.outstandingClaims(undefined), { total: 0, count: 0 })
})

/* ------------------------------------------------------------------ *
 * Deeldeclaraties: "€X uit categorie <cat> is werk"                    *
 * ------------------------------------------------------------------ */

// Een deeldeclaratie is een credit in een uitgavencategorie (bijv. OV/reiskosten).
const partial = (extra = {}) => ({ date: '2026-09-15', amount: 10, type: 'credit', category: 'reiskosten', ...extra })

t('isPartialClaim herkent alleen een credit met een declaratiestatus', () => {
  assert.equal(C.isPartialClaim(partial({ claimStatus: 'open' })), true)
  assert.equal(C.isPartialClaim(partial({ claimStatus: 'submitted' })), true)
  assert.equal(C.isPartialClaim(partial({ claimStatus: 'paid' })), true)
  assert.equal(C.isPartialClaim(partial({ claimStatus: 'rejected' })), true)
  assert.equal(C.isPartialClaim(partial({ claimStatus: 'payout' })), false, 'de bulkbetaling is geen deeldeclaratie')
  assert.equal(C.isPartialClaim(partial()), false, 'zonder status is het een gewone bijschrijving')
  assert.equal(C.isPartialClaim(debit({ claimStatus: 'open' })), false, 'een debit-declaratie is geen deeldeclaratie')
})

t('deeldeclaratie: open/submitted/paid tellen mee, rejected niet (het omgekeerde van een gewone declaratie)', () => {
  for (const s of ['open', 'submitted', 'paid']) {
    assert.equal(C.isOpenClaim(partial({ claimStatus: s })), false, s)
    assert.equal(C.countsInTotals(partial({ claimStatus: s })), true, s)
    assert.equal(C.isCountedIncome(partial({ claimStatus: s })), true, s)
    assert.equal(C.isCountedExpense(partial({ claimStatus: s })), false, `${s}: een credit is nooit een uitgave`)
  }
  assert.equal(C.isOpenClaim(partial({ claimStatus: 'rejected' })), true, 'werk betaalt niet, dus telt niet meer mee')
  assert.equal(C.countsInTotals(partial({ claimStatus: 'rejected' })), false)
  assert.equal(C.isCountedIncome(partial({ claimStatus: 'rejected' })), false)
  assert.equal(C.isCountedExpense(partial({ claimStatus: 'rejected' })), false)
})

t('outstandingClaims telt deeldeclaraties gewoon mee', () => {
  const list = [
    partial({ amount: 10, claimStatus: 'open' }),
    partial({ amount: 15, claimStatus: 'submitted' }),
    debit({ amount: 25, claimStatus: 'open' }),
    partial({ amount: 99, claimStatus: 'rejected' }),   // niet open/submitted, telt niet mee
    partial({ amount: 5, claimStatus: 'paid' }),         // al uitbetaald, telt niet mee
  ]
  assert.deepEqual(C.outstandingClaims(list), { total: 50, count: 3 })
})

t('claimMonthlySeries telt deeldeclaraties ook als voorgeschoten', () => {
  const now = new Date('2026-09-14T12:00:00')
  const list = [
    debit({ date: '2026-09-01', amount: 30, claimStatus: 'open' }),
    partial({ date: '2026-09-05', amount: 10, claimStatus: 'open' }),
    partial({ date: '2026-09-10', amount: 20, claimStatus: 'rejected' }),
    { date: '2026-09-12', amount: 40, type: 'credit', category: 'salaris', claimStatus: 'payout' },
  ]
  const series = C.claimMonthlySeries(list, { months: 1, now })
  assert.equal(series.length, 1)
  assert.equal(series[0].advanced, 60, 'debit- én deeldeclaratie tellen mee als voorgeschoten')
  assert.equal(series[0].received, 40)
})

t('partialClaimDate: laatste dag van de maand, maar nooit later dan vandaag', () => {
  const huidigeMaand = new Date('2026-09-16T10:00:00')
  assert.equal(C.partialClaimDate(2026, 9, huidigeMaand), '2026-09-16', 'huidige maand -> vandaag')
  assert.equal(C.partialClaimDate(2026, 8, huidigeMaand), '2026-08-31', 'vorige maand -> laatste dag')
  assert.equal(C.partialClaimDate(2026, 1, huidigeMaand), '2026-01-31')

  assert.equal(C.partialClaimDate(2028, 2, new Date('2028-03-05T10:00:00')), '2028-02-29', 'schrikkeljaar')
  assert.equal(C.partialClaimDate(2027, 2, new Date('2027-03-05T10:00:00')), '2027-02-28', 'geen schrikkeljaar')
})

t('partialClaimNote: "<Categorielabel> werk <maand> <jaar>"', () => {
  assert.equal(C.partialClaimNote('OV', 2026, 9), 'OV werk september 2026')
  assert.equal(C.partialClaimNote('Boodschappen', 2026, 1), 'Boodschappen werk januari 2026')
})

console.log(`\n${pass} geslaagd, ${fail} gefaald (claims.js)`)
process.exit(fail ? 1 : 0)
