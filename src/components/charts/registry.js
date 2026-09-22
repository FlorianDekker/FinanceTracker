// Registratie van alle grafieken plus het samenvoegen van de opgeslagen
// voorkeuren. Staat los van ChartsPage zodat Instellingen dezelfde lijst en
// dezelfde merge-regels gebruikt zonder de pagina te importeren.
import { PaceChart } from './PaceChart'
import { CashflowChart } from './CashflowChart'
import { SavingsTrendChart } from './SavingsTrendChart'
import { YearGrid } from './YearGrid'
import { SpendingDonut } from './SpendingDonut'
import { DailyChart } from './DailyChart'
import { TrendsChart } from './TrendsChart'
import { TopSpendingChart } from './TopSpendingChart'
import { WeekdayChart } from './WeekdayChart'
import { CompareChart } from './CompareChart'
import { AverageChart } from './AverageChart'
import { ForecastChart } from './ForecastChart'
import { RecordsChart } from './RecordsChart'
import { SubcategoryChart } from './SubcategoryChart'
import { SubTrendsChart } from './SubTrendsChart'
import { CalendarChart } from './CalendarChart'
import { StreaksChart } from './StreaksChart'
import { SubscriptionsChart } from './SubscriptionsChart'
import { BudgetDriftChart } from './BudgetDriftChart'
import { GroceryGroupsChart } from './GroceryGroupsChart'
import { PriceHistoryChart } from './PriceHistoryChart'

/**
 * Alle beschikbare grafieken, in de volgorde waarin een nieuwe installatie ze
 * krijgt. `defaultOn: false` betekent: wel te kiezen in Instellingen, maar
 * standaard uit. `needsReceipts: true` betekent: standaard uit zolang er geen
 * enkele bon is, en vanzelf aan zodra de eerste bon binnenkomt — een lege
 * bon-grafiek in de tabbalk is alleen maar ruis. Nieuwe grafieken die hier
 * bijkomen verschijnen ook bij bestaande gebruikers achteraan in de lijst
 * (zie `mergeChartConfig`).
 */
export const ALL_CHARTS = [
  { id: 'budgettempo',    label: 'Budgettempo',    usesMonth: true,  Component: PaceChart },
  { id: 'spaarpercentage', label: 'Spaarpercentage', usesMonth: false, Component: CashflowChart },
  { id: 'spaartrend',     label: 'Spaartrend',     usesMonth: false, Component: SavingsTrendChart },
  { id: 'verdeling',      label: 'Verdeling',      usesMonth: true,  Component: SpendingDonut },
  { id: 'dagelijks',      label: 'Dagelijks',      usesMonth: true,  Component: DailyChart },
  { id: 'top',            label: 'Top',            usesMonth: true,  Component: TopSpendingChart },
  { id: 'weekdag',        label: 'Weekdag',        usesMonth: true,  Component: WeekdayChart },
  { id: 'vergelijk',      label: 'Vergelijk',      usesMonth: true,  Component: CompareChart },
  { id: 'forecast',       label: 'Forecast',       usesMonth: true,  Component: ForecastChart },
  { id: 'subcategorie',   label: 'Subcategorieën', usesMonth: true,  Component: SubcategoryChart },
  { id: 'subtrends',      label: 'Sub trends',     usesMonth: false, Component: SubTrendsChart },
  { id: 'gemiddeld',      label: 'Gemiddeld',      usesMonth: false, Component: AverageChart },
  { id: 'records',        label: 'Records',        usesMonth: false, Component: RecordsChart },
  { id: 'jaar',           label: 'Jaar',           usesMonth: false, Component: YearGrid },
  { id: 'trends',         label: 'Trends',         usesMonth: false, Component: TrendsChart },
  { id: 'abonnementen',   label: 'Vaste lasten',   usesMonth: false, Component: SubscriptionsChart },
  { id: 'budgetdrift',    label: 'Budget-drift',   usesMonth: false, Component: BudgetDriftChart },
  { id: 'kalender',       label: 'Kalender',       usesMonth: true,  Component: CalendarChart, defaultOn: false },
  { id: 'streaks',        label: 'Streaks',        usesMonth: true,  Component: StreaksChart,  defaultOn: false },
  { id: 'bongroepen',     label: 'Boodschappen-verdeling', usesMonth: true,  Component: GroceryGroupsChart, needsReceipts: true },
  { id: 'prijzen',        label: 'Prijzen',        usesMonth: false, Component: PriceHistoryChart, needsReceipts: true },
]

export const DEFAULT_ORDER = ALL_CHARTS.map(c => c.id)
export const CHART_MAP = Object.fromEntries(ALL_CHARTS.map(c => [c.id, c]))

/**
 * Staat een grafiek standaard aan? `ctx.hasReceipts` maakt de bon-grafieken
 * zichtbaar; zonder context gedragen ze zich alsof er nog geen bon is.
 */
export function chartDefaultOn(chart, ctx = {}) {
  if (!chart) return false
  if (chart.needsReceipts) return !!ctx.hasReceipts
  return chart.defaultOn !== false
}

export const DEFAULT_ENABLED = ALL_CHARTS.filter(c => chartDefaultOn(c)).map(c => c.id)

/**
 * Maakt van een opgeslagen `chartConfig` een bruikbare {order, enabled}.
 * - grafieken die niet meer bestaan vallen stil weg (bv. de oude 'detail');
 * - grafieken die er sinds het opslaan bij zijn gekomen komen achteraan in de
 *   volgorde te staan met hun eigen standaard aan/uit — anders zou een nieuwe
 *   grafiek voor bestaande gebruikers onvindbaar zijn, ook in Instellingen.
 *
 * `ctx` geeft de stand van de app mee (nu alleen `hasReceipts`). Zodra de
 * gebruiker zelf iets aan- of uitzet, wordt die keuze opgeslagen en wint hij:
 * een bon-grafiek die je uitzet komt niet terug bij de volgende bon.
 */
export function mergeChartConfig(saved, ctx = {}) {
  if (!saved) return { order: DEFAULT_ORDER, enabled: ALL_CHARTS.filter(c => chartDefaultOn(c, ctx)).map(c => c.id) }
  const bekend = new Set(DEFAULT_ORDER)
  const opgeslagen = (saved.order ?? []).filter(id => bekend.has(id))
  const gezien = new Set(opgeslagen)
  const nieuw = DEFAULT_ORDER.filter(id => !gezien.has(id))
  const enabledSet = new Set(saved.enabled ?? [])
  const enabled = [...opgeslagen.filter(id => enabledSet.has(id)),
                   ...nieuw.filter(id => chartDefaultOn(CHART_MAP[id], ctx))]
  return { order: [...opgeslagen, ...nieuw], enabled }
}

