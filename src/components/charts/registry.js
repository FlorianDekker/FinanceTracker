// Registratie van alle grafieken plus het samenvoegen van de opgeslagen
// voorkeuren. Staat los van ChartsPage zodat Instellingen dezelfde lijst en
// dezelfde merge-regels gebruikt zonder de pagina te importeren.
import { PaceChart } from './PaceChart'
import { CashflowChart } from './CashflowChart'
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

/**
 * Alle beschikbare grafieken, in de volgorde waarin een nieuwe installatie ze
 * krijgt. `defaultOn: false` betekent: wel te kiezen in Instellingen, maar
 * standaard uit. Nieuwe grafieken die hier bijkomen verschijnen ook bij
 * bestaande gebruikers achteraan in de lijst, met hun eigen `defaultOn`
 * (zie `mergeChartConfig`).
 */
export const ALL_CHARTS = [
  { id: 'budgettempo',    label: 'Budgettempo',    usesMonth: true,  Component: PaceChart },
  { id: 'spaarpercentage', label: 'Spaarpercentage', usesMonth: false, Component: CashflowChart },
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
]

export const DEFAULT_ORDER = ALL_CHARTS.map(c => c.id)
export const DEFAULT_ENABLED = ALL_CHARTS.filter(c => c.defaultOn !== false).map(c => c.id)
export const CHART_MAP = Object.fromEntries(ALL_CHARTS.map(c => [c.id, c]))

/**
 * Maakt van een opgeslagen `chartConfig` een bruikbare {order, enabled}.
 * - grafieken die niet meer bestaan vallen stil weg (bv. de oude 'detail');
 * - grafieken die er sinds het opslaan bij zijn gekomen komen achteraan in de
 *   volgorde te staan met hun eigen standaard aan/uit — anders zou een nieuwe
 *   grafiek voor bestaande gebruikers onvindbaar zijn, ook in Instellingen.
 */
export function mergeChartConfig(saved) {
  if (!saved) return { order: DEFAULT_ORDER, enabled: DEFAULT_ENABLED }
  const bekend = new Set(DEFAULT_ORDER)
  const opgeslagen = (saved.order ?? []).filter(id => bekend.has(id))
  const gezien = new Set(opgeslagen)
  const nieuw = DEFAULT_ORDER.filter(id => !gezien.has(id))
  const enabledSet = new Set(saved.enabled ?? [])
  const enabled = [...opgeslagen.filter(id => enabledSet.has(id)),
                   ...nieuw.filter(id => CHART_MAP[id].defaultOn !== false)]
  return { order: [...opgeslagen, ...nieuw], enabled }
}

