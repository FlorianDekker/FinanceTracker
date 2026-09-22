/**
 * Spaarpercentage-rekenwerk, los van Dexie en React zodat het testbaar is.
 * Een rij is { year, month, income, expenses } zoals useCashflowData ze levert.
 *
 * Twee percentages die je uit elkaar moet houden:
 *  - per maand:   (inkomen − uitgaven) ÷ inkomen, kan negatief zijn, en is
 *                 `null` zolang er die maand nog geen inkomen is (geen 0%!)
 *  - over een periode: totaal gespaard ÷ totaal inkomen over de maanden mét
 *                 inkomen. Dat is een gewogen gemiddelde; een maand zonder
 *                 salaris trekt het dus niet naar beneden.
 */

/** Spaarpercentage van één maand als fractie; null zonder inkomen. */
export function monthRate(row) {
  const income = Number(row?.income) || 0
  if (income <= 0) return null
  return (income - (Number(row?.expenses) || 0)) / income
}

/** Gewogen spaarpercentage over meerdere maanden, plus de totalen erachter. */
export function periodSavings(rows) {
  let income = 0
  let expenses = 0
  let months = 0
  for (const r of rows ?? []) {
    const inc = Number(r?.income) || 0
    if (inc <= 0) continue
    income += inc
    expenses += Number(r?.expenses) || 0
    months += 1
  }
  const saved = income - expenses
  return { income, expenses, saved, months, rate: income > 0 ? saved / income : null }
}

/** Per rij het gewogen percentage over de laatste `n` rijen (voortschrijdend). */
export function rollingRates(rows, n = 12) {
  const lijst = rows ?? []
  return lijst.map((_, i) => periodSavings(lijst.slice(Math.max(0, i - n + 1), i + 1)).rate)
}

/** Fractie → heel percentage; null blijft null. */
export function pct(rate) {
  return rate == null || !Number.isFinite(rate) ? null : Math.round(rate * 100)
}
