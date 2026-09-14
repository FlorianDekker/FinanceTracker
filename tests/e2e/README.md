# End-to-end regressietest

`npm run test:e2e` bouwt twee versies van de app uit git en draait ze achter elkaar
in Chrome op dezelfde origin (`http://localhost:4173/FinanceTracker/`):

- **Run A** – build van `BASE_REF` (standaard `main`): verse installatie, import van
  `Dictionary.json` + `Transactions.csv` en een handmatige budgetwijziging.
- **Run B** – build van `TARGET_REF` (standaard `HEAD`) op **hetzelfde**
  Chrome-profiel, dus op dezelfde IndexedDB: dit test de echte Dexie-upgrade, alle
  vijftien charttabs, de transactie- en importpagina, het categorie-beheer
  (scenario D) en de sheets/swipes/backup/regels (scenario E).
- **Run C** – verse installatie op de `TARGET_REF`-build: de onboarding-wizard
  (welkom → template Standaard → budgetten overslaan → "Begin leeg") en daarna
  scenario G (bankimport + kolommapper, scenario-import.mjs).
- **Run C2** – nog een verse installatie, nu met "Probeer met voorbeelddata":
  dashboard, declaraties, de gele demo-regel in Instellingen en "Wis en begin
  opnieuw".

Aan het eind volgt een lijst met PASS/FAIL-checks; exit-code 1 zodra er één faalt.
Screenshots en JSON-dumps komen in `tests/e2e/out/` (gitignored).

## Vereisten

- **Google Chrome** lokaal geïnstalleerd (`channel: 'chrome'`; Playwright
  downloadt bewust geen eigen browsers).
- Een datamap met `Dictionary.json` en `Transactions.csv` (alleen voor run A/B;
  `--scenario=import` en `--scenario=demo` draaien zonder). Standaard
  `~/Documents/FinanceTracker-data`, anders `FT_DATA_DIR=<pad>`. Die data staat
  bewust buiten de repo; ontbreekt ze, dan stopt de test met een duidelijke fout.

## Een nieuwe fase testen

```sh
TARGET_REF=v2/stap-7 npm run test:e2e            # main -> branch
BASE_REF=v2/stap-6 TARGET_REF=v2/stap-7 npm run test:e2e
npm run test:e2e:beheer                          # alleen scenario D
npm run test:e2e:e                               # alleen scenario E
npm run test:e2e:import                          # alleen run C + scenario G (geen eigen data nodig)
npm run test:e2e:demo                            # alleen run C2 (voorbeelddata)
```

De builds draaien in tijdelijke `git worktree --detach`-mappen onder
`tests/e2e/.wt/` (die de `node_modules` van de repo lenen) en worden altijd weer
opgeruimd, ook bij een fout of Ctrl-C. Je eigen werkmap blijft dus ongemoeid.

Overige knoppen: `FT_VERWACHTE_MAAND` (standaard `Maart 2026`, de laatste maand in
de testdata) en `FT_E2E_PORT`.

## Waarom de service worker uit staat

De statische testserver serveert een lege `sw.js` en `registerSW.js`. Zonder die
truc levert de precache van run A tijdens run B de oude build terug en testen we
de migratie helemaal niet.
