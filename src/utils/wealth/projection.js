/**
 * "Red ik het?" — het vermogen van vandaag doorgetrokken naar de komende
 * maanden: elke maand komt er je gemiddelde spaarbedrag bij en gaan de
 * reserveringen die die maand vervallen eraf.
 *
 * De eerste projectiemaand is de *volgende* maand: van de lopende maand is al
 * een deel voorbij en dat zit al in het saldo van vandaag. Reserveringen die
 * al vervallen zijn (of deze maand vervallen) en nog openstaan, landen wél in
 * die eerste stap — ze moeten immers nog betaald worden.
 * Reserveringen zonder maand ("ooit") blijven buiten de lijn en worden apart
 * getoond; je weet niet wanneer ze komen.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */
import { addMonths, monthOf, round2 } from './months'

function openReservations(reservations) {
  return (reservations ?? []).filter(r => r && !r.done)
}

/**
 * @param start         vermogen vandaag
 * @param monthly       verwacht spaarbedrag per maand
 * @param reservations  rijen uit `db.reservations` (afgevinkte worden genegeerd)
 * @param months        aantal maanden vooruit
 * @param buffer        bedrag dat je nooit wilt aanraken
 * @param now           voor tests
 * @returns {{ points, buffer, unplanned, low, firstBelow, end }}
 *          `points[0]` is vandaag (`now: true`), daarna één punt per maand met
 *          `due` (de reserveringen die daar afgaan).
 */
export function projectWealth({ start = 0, monthly = 0, reservations = [], months = 24, buffer = 0, now = new Date() } = {}) {
  const open = openReservations(reservations)
  const huidig = monthOf(now)
  const aantal = Math.max(1, Math.round(Number(months) || 0))
  const perMaand = round2(monthly)

  const punten = [{ month: huidig, balance: round2(start), due: [], now: true }]
  let saldo = round2(start)

  for (let i = 1; i <= aantal; i++) {
    const maand = addMonths(huidig, i)
    const due = open.filter(r => {
      const m = typeof r.dueMonth === 'string' ? r.dueMonth.slice(0, 7) : null
      if (!m) return false
      // Achterstallige en deze maand vervallende reserveringen in de eerste stap.
      return i === 1 ? m <= maand : m === maand
    })
    const af = round2(due.reduce((s, r) => s + (Number(r.amount) || 0), 0))
    saldo = round2(saldo + perMaand - af)
    punten.push({ month: maand, balance: saldo, due, now: false })
  }

  const laagste = punten.reduce((laag, p) => (p.balance < laag.balance ? p : laag), punten[0])
  const onder = punten.find(p => !p.now && p.balance < buffer) ?? null

  return {
    points: punten,
    buffer: round2(buffer),
    monthly: perMaand,
    unplanned: round2(open.filter(r => !r.dueMonth).reduce((s, r) => s + (Number(r.amount) || 0), 0)),
    low: { month: laagste.month, balance: laagste.balance },
    firstBelow: onder ? onder.month : null,
    end: punten[punten.length - 1].balance,
  }
}
