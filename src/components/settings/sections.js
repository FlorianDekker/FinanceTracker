import { SettingsAppearance } from './SettingsAppearance'
import { SettingsCharts } from './SettingsCharts'
import { SettingsBudgets } from './SettingsBudgets'
import { SettingsCategories } from './SettingsCategories'
import { SettingsClaims } from './SettingsClaims'
import { SettingsReceipts } from './SettingsReceipts'
import { SettingsBalance } from './SettingsBalance'
import { SettingsData } from './SettingsData'
import { SettingsAdvanced } from './SettingsAdvanced'

/**
 * Eén bron van waarheid voor het overzichtsscherm (/settings) en de
 * subschermen (/settings/:sectie). `subtitle` is de statische fallback-tekst
 * voor de rij op het overzicht; sommige rijen krijgen op het overzicht een
 * dynamischere tekst (zie SettingsPage.jsx).
 */
export const SETTINGS_SECTIONS = [
  { id: 'appearance', icon: '🎨', title: 'Weergave', subtitle: 'Accentkleur en thema', Component: SettingsAppearance },
  { id: 'charts', icon: '📊', title: 'Grafieken', subtitle: 'Volgorde en zichtbaarheid', Component: SettingsCharts },
  { id: 'budgets', icon: '💰', title: 'Budgetten', subtitle: 'Maandbudget per categorie', Component: SettingsBudgets },
  { id: 'categories', icon: '🗂️', title: 'Categorieën', subtitle: 'Beheren en herkenningsregels', Component: SettingsCategories },
  { id: 'claims', icon: '💼', title: 'Declaraties', subtitle: 'Indienen en uitbetaling koppelen', Component: SettingsClaims },
  { id: 'receipts', icon: '🧾', title: 'Bonnetjes & AI', subtitle: 'Uitlezen met AI en de iPhone-shortcut', Component: SettingsReceipts },
  { id: 'balance', icon: '⚖️', title: 'Saldocontrole', subtitle: 'Vergelijk met je bank', Component: SettingsBalance },
  { id: 'data', icon: '💾', title: 'Data', subtitle: 'Backup, terugzetten en voorbeelddata', Component: SettingsData },
  { id: 'advanced', icon: '🧰', title: 'Geavanceerd', subtitle: 'Betrouwbaarheid en salarisdrempel', Component: SettingsAdvanced },
]
