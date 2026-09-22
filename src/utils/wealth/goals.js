/**
 * Spaardoelen: wie krijgt welke maand hoeveel?
 *
 * Elke maand is er precies één pot: wat je die maand overhield (`saved`).
 * Die verdeel je over je doelen, in volgorde (`order`), als een waterval:
 *
 *  1. eerst de doelen met een `fixed`-regel — die leggen hun vaste bedrag
 *     opzij en verkleinen daarmee de pot voor de rest;
 *  2. daarna de surplus-regels, op volgorde: `surplus` pakt alles wat er nog
 *     is, `surplus_above` laat `floor` in de pot staan (bijv. "houd €200 op
 *     de betaalrekening") en pakt de rest.
 *
 * Een doel dat vol is (target bereikt) neemt niets meer; wat het niet meer
 * nodig heeft stroomt door naar het volgende doel. Er wordt nooit meer
 * verdeeld dan er die maand overbleef: ook een `fixed`-regel kan niet meer
 * opzijleggen dan er was — anders zou de som van je doelen groter worden dan
 * je vermogen. Handmatige stortingen staan daar los van: die tellen wél mee
 * voor de voortgang, maar komen niet uit de maandpot.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { monthKey } from '../cashflow'
import { addMonths, monthOf, round2 } from './months'

export const GOAL_RULES = ['fixed', 'surplus', 'surplus_above']
const ETA_WINDOW = 6   // maanden waarover we het tempo middelen

/** Maandrijen van `cashflowPerMonth` (of { month: 'YYYY-MM', saved }) normaliseren. */
function normalizeMonths(months) {
  return (months ?? [])
    .map(r => ({
      month: typeof r?.month === 'string' ? r.month : monthKey(r?.year, r?.month),
      // Een maand waarin je meer uitgaf dan binnenkwam levert niets op; er
      // gaat dan niets naar de doelen (en er gaat ook niets vanaf).
      saved: Math.max(0, round2(r?.saved)),
    }))
    .filter(r => /^\d{4}-\d{2}$/.test(r.month))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
}

function ruleType(goal) {
  const type = goal?.rule?.type
  return GOAL_RULES.includes(type) ? type : 'surplus'
}

/** Wat wil dit doel deze maand hebben, gegeven wat er nog in de pot zit? */
function wish(goal, beschikbaar) {
  switch (ruleType(goal)) {
    case 'fixed':
      return Math.max(0, Number(goal.rule?.amount) || 0)
    case 'surplus_above':
      return Math.max(0, beschikbaar - (Number(goal.rule?.floor) || 0))
    default:
      return beschikbaar
  }
}

/**
 * @param months  [{ year, month, saved }] of [{ month: 'YYYY-MM', saved }] —
 *                alleen volle maanden aanleveren; de lopende maand telt pas
 *                als hij voorbij is.
 * @param goals   rijen uit `db.goals`
 * @returns {{ goals: [...], months: [{ month, saved, allocated, left }] }}
 *          Per doel: `saved` (totaal binnen), `progress` (max. target),
 *          `remaining`, `reached`/`reachedMonth`, `perMonth` ({ maand: bedrag }),
 *          `pace` (gemiddeld per maand over de laatste 6) en `etaMonth`.
 */
export function allocateGoals(months, goals) {
  const rijen = normalizeMonths(months)
  const staat = (goals ?? [])
    .map((g, i) => ({
      goal: g,
      id: g.id,
      order: Number.isFinite(g.order) ? g.order : i,
      target: Math.max(0, Number(g.target) || 0),
      startMonth: typeof g.startMonth === 'string' ? g.startMonth.slice(0, 7) : null,
      deposits: 0,
      allocated: 0,
      perMonth: {},
      reachedMonth: null,
    }))
    .sort((a, b) => a.order - b.order)

  const vast = staat.filter(s => ruleType(s.goal) === 'fixed')
  const surplus = staat.filter(s => ruleType(s.goal) !== 'fixed')

  // Handmatige stortingen per maand; alles vóór de eerste maand telt vooraf mee.
  const eerste = rijen[0]?.month ?? null
  const stortingen = new Map()
  for (const s of staat) {
    for (const d of Array.isArray(s.goal.manualDeposits) ? s.goal.manualDeposits : []) {
      const bedrag = round2(d?.amount)
      if (!bedrag) continue
      const maand = monthOf(String(d?.date ?? ''))
      if (!eerste || maand < eerste) { s.deposits += bedrag; continue }
      const lijst = stortingen.get(maand) ?? []
      lijst.push({ s, bedrag })
      stortingen.set(maand, lijst)
    }
  }

  const perMaand = []
  for (const rij of rijen) {
    for (const { s, bedrag } of stortingen.get(rij.month) ?? []) s.deposits += bedrag

    let pot = rij.saved
    for (const s of [...vast, ...surplus]) {
      if (pot <= 0) break
      if (s.startMonth && rij.month < s.startMonth) continue
      const nodig = s.target > 0 ? Math.max(0, s.target - s.deposits - s.allocated) : Infinity
      if (nodig <= 0) continue
      const deel = round2(Math.min(pot, wish(s.goal, pot), nodig))
      if (deel <= 0) continue
      s.allocated = round2(s.allocated + deel)
      s.perMonth[rij.month] = round2((s.perMonth[rij.month] ?? 0) + deel)
      pot = round2(pot - deel)
    }

    for (const s of staat) {
      if (s.reachedMonth == null && s.target > 0 && s.deposits + s.allocated >= s.target - 0.005) {
        s.reachedMonth = rij.month
      }
    }
    perMaand.push({ month: rij.month, saved: rij.saved, allocated: round2(rij.saved - pot), left: pot })
  }

  // Stortingen ná de laatste volle maand (bijv. vandaag) tellen gewoon mee.
  const laatste = rijen[rijen.length - 1]?.month ?? null
  for (const [maand, lijst] of stortingen) {
    if (laatste && maand > laatste) for (const { s, bedrag } of lijst) s.deposits += bedrag
  }

  const staart = rijen.slice(-ETA_WINDOW).map(r => r.month)
  const uitkomst = staat.map(s => {
    const totaal = round2(s.deposits + s.allocated)
    const rest = Math.max(0, round2(s.target - totaal))
    // Tempo: gemiddeld per maand over de laatste zes maanden (maanden waarin
    // er niets naar dit doel ging tellen als 0 — dat is de eerlijke schatting).
    const tempo = staart.length
      ? round2(staart.reduce((sum, m) => sum + (s.perMonth[m] ?? 0), 0) / staart.length)
      : 0
    const etaMonths = rest > 0 && tempo > 0 ? Math.ceil(rest / tempo) : null
    return {
      id: s.id,
      goal: s.goal,
      rule: ruleType(s.goal),
      target: s.target,
      deposits: round2(s.deposits),
      allocated: round2(s.allocated),
      saved: totaal,
      progress: s.target > 0 ? Math.min(s.target, totaal) : totaal,
      fraction: s.target > 0 ? Math.min(1, totaal / s.target) : 0,
      remaining: rest,
      reached: s.target > 0 && rest <= 0,
      reachedMonth: s.reachedMonth,
      perMonth: s.perMonth,
      pace: tempo,
      etaMonths,
      etaMonth: etaMonths == null || laatste == null ? null : addMonths(laatste, etaMonths),
    }
  })

  return { goals: uitkomst, months: perMaand }
}
