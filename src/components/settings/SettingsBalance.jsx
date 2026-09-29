import { BalanceCheckCard } from './BalanceCheckCard'

/**
 * Instellingen -> Saldocontrole: vergelijk het verwachte saldo met wat de
 * bank-app nu toont.
 */
export function SettingsBalance() {
  return (
    <section className="px-4 pt-4 pb-2">
      <BalanceCheckCard />
    </section>
  )
}
