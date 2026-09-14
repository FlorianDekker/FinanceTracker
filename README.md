# FinanceTracker

Een persoonlijke budget-app als PWA. Je importeert je ABN AMRO-afschriften,
de app categoriseert de transacties zelflerend (handmatige correcties worden
onthouden) en laat je per maand zien waar je geld heen gaat: budgetten,
cashflow, trends en vergelijkingen tussen periodes.

Alle gegevens blijven lokaal op je eigen apparaat, in IndexedDB. Er is geen
server, geen account en er gaat niets naar buiten.

## Stack

React 19, Vite 8, Tailwind CSS, Dexie (IndexedDB), Chart.js en vite-plugin-pwa.

## Aan de slag

```bash
npm install
npm run dev      # lokale dev-server
npm run build    # productie-build naar dist/
npm run deploy   # build + publiceren naar GitHub Pages
```

De app draait op https://floriandekker.github.io/FinanceTracker

De oorspronkelijke iOS-Scriptable-implementatie staat als referentie in
`legacy/scriptable/` en wordt niet meer onderhouden.
