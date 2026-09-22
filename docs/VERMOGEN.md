# Vermogen — ontwerp

Doel: één scherm dat antwoord geeft op "red ik het?": wat heb ik (rekeningen),
wat moet daar nog vanaf (reserveringen voor voorziene kosten), waar spaar ik
voor (spaardoelen met een vulregel), en hoe loopt dat de komende twee jaar.

## Aannames (door Florian te bevestigen; zo gebouwd tot hij anders zegt)
- **Investeren** is een gewone uitgavencategorie. "Wat ik overhoud" per maand is
  dus precies `saved = inkomen − uitgaven` zoals `useCashflowData` het al rekent
  (daar zit de €500 investeren al in de uitgaven).
- Andere banken/spaarrekeningen: saldo voorlopig handmatig invoeren en bijwerken.

## Data (schema v7, al aanwezig in `src/db/db.js`)

```
accounts:         key, order
  { key: slug, name, kind: 'betaal'|'spaar'|'beleggen'|'overig', order,
    source: 'abn-import' | 'manual',   // abn-import: saldo komt uit de bankimport
    account: 'NL..' | null,            // IBAN voor source abn-import
    balance: number | null,            // laatst bekende/ingevoerde saldo
    balanceAt: 'YYYY-MM-DD' | null, archived: false }

accountSnapshots: ++id, accountKey, date, [accountKey+date]
  { id, accountKey, date: 'YYYY-MM-DD', balance }   // één per rekening per dag (upsert)

reservations:     ++id, dueMonth
  { id, name, amount, dueMonth: 'YYYY-MM' | null,   // null = "ooit"
    note, done: false, doneAt: null, category: '' }

goals:            ++id, order
  { id, name, icon, target, order,
    rule: { type: 'fixed', amount } | { type: 'surplus' } | { type: 'surplus_above', floor },
    startMonth: 'YYYY-MM', manualDeposits: [{ date, amount, note }],
    reached: false, reachedAt: null }
```
`trips`/`tripItems` horen bij Vakanties — niet aanraken.

Instellingen (`db.settings`): `wealthBuffer` (bedrag dat je nooit wilt
aanraken, standaard 1000), `wealthProjectionMonths` (standaard 24).

## Rekeningen

- De ABN-betaalrekening: bij het eerste bezoek automatisch aangemaakt uit de
  ankers van `anchorsPerAccount` (`src/utils/balance.js`, bestaat al): per
  rekening met banksaldo één account met `source: 'abn-import'`. Saldo =
  `expectedBalance(anchor, manualSince(...))` — dezelfde logica als de
  saldocontrole, hergebruik `useBalanceCheck`-logica, niet kopiëren. Elke dag
  dat het scherm opent: upsert een snapshot van vandaag.
- Handmatige rekeningen: naam, soort, saldo. "Saldo bijwerken" → nieuw saldo +
  datum (standaard vandaag) → upsert snapshot + `balance/balanceAt` op de rekening.
- Totaal vermogen = Σ saldo van niet-gearchiveerde rekeningen.
- Verloop: lijn per dag over alle snapshots (som over rekeningen; voor een
  rekening zonder snapshot op een dag geldt de laatste bekende). Puur:
  `src/utils/wealth/history.js`, getest.

## Reserveringen

Lijst met naam, bedrag, maand (of "ooit"), notitie; afvinken als gedaan
(blijft zichtbaar, doorgestreept, klapt in). Totalen: gepland (met maand),
ongepland ("ooit"), totaal. **Vrij vermogen** = totaal vermogen − buffer −
Σ open reserveringen. Rood als negatief.

## Spaardoelen

Vulregels, per maand vanaf `startMonth` t/m de vorige volle maand (de lopende
maand telt pas als hij voorbij is):
- `fixed`: `amount` per maand;
- `surplus`: alles wat die maand overbleef (`saved`, niet onder 0);
- `surplus_above`: `max(0, saved − floor)`.
Waterval: doelen op `order`; het beschikbare surplus van een maand gaat eerst
naar doel 1 tot dat vol is, de rest naar doel 2, enz. `fixed` gaat vóór de
surplus-regels en vermindert het surplus dat voor de rest overblijft.
`manualDeposits` tellen er los bij. Voortgang = min(target, som). Verwacht
klaar = extrapoleer met het gemiddelde maandbedrag van de laatste 6 maanden
(null als 0). Puur: `src/utils/wealth/goals.js` (`allocateGoals(months, goals)`),
getest met scenario's: één doel surplus; fixed + surplus; surplus_above met
floor; maand met negatief saldo; doel bereikt halverwege de maand-reeks.

Bron voor `saved` per maand: dezelfde berekening als `useCashflowData`
(inkomen/uitgaven met `countsInTotals`, transfers en Voorschot eruit). Trek die
logica uit de hook naar een pure functie `cashflowPerMonth(txs, catMap, transferKey, months)`
in `src/utils/cashflow.js` en laat `useCashflowData` die gebruiken (gedrag
identiek; bestaande tests/grafieken mogen niet veranderen).

## Projectie ("red ik het?")

Startpunt = totaal vermogen vandaag. Per komende maand: + verwacht spaarbedrag
(gewogen gemiddelde `saved` van de laatste 6 volle maanden, via
`periodSavings` uit `src/utils/savings.js` → `saved / months`) − reserveringen
met `dueMonth` in die maand. Ongeplande reserveringen: als één blok apart tonen
("nog ongepland: €X"), niet in de lijn. Lijn met horizontale bufferlijn; rood
gekleurd segment zodra de lijn onder de buffer komt; markers op de maanden met
een reservering (tooltip: naam + bedrag). Kengetallen: laagste punt (maand +
bedrag), "eerste maand onder buffer" of "blijft boven buffer". Puur:
`src/utils/wealth/projection.js`, getest.

## Scherm `/vermogen` (`src/pages/WealthPage.jsx`, placeholder bestaat)

Van boven naar beneden:
1. Kop-tegel: totaal vermogen, vrij vermogen (na buffer en reserveringen),
   klein: buffer (tik = instellen).
2. Projectie-grafiek + kengetallen.
3. Rekeningen (kaartjes met soort-icoon, saldo, "bijgewerkt op"; abn-import
   toont "uit import"; + Rekening; tik = bijwerken/bewerken/archiveren) en
   daaronder ingeklapt de verloop-grafiek.
4. Reserveringen (lijst; + Reservering; tik = bewerken/afvinken).
5. Spaardoelen (kaart per doel: icoon, naam, voortgangsbalk, €x van €y,
   verwacht klaar; tik = detail met maandbijdragen en handmatig storten;
   + Spaardoel met regelkeuze; slepen of pijltjes voor volgorde).

Grafieken: Chart.js via react-chartjs-2 zoals in `src/components/charts/*`
(thema-helpers uit `src/utils/theme.js`). Stijl en toon zoals de rest van de
app: Nederlandse commentaren, Tailwind + `var(--color-…)`.

## Backup
Tabellen staan al in `BACKUP_TABLES`. `accounts` heeft string-keys en
`accountSnapshots.accountKey` verwijst daarnaar: geen id-remap nodig.
`reservations`/`goals` staan op zichzelf. Controleer alleen dat herstellen
(vervangen én samenvoegen) ze meeneemt; test in `tests/unit/backup.test.mjs`
alleen uitbreiden als de Vakanties-agent dat bestand niet tegelijk bewerkt —
zo niet, zet je test in een eigen `tests/unit/wealth-backup.test.mjs`.

## Buiten scope (nu)
Import van andere banken, rente/rendement, meerdere valuta.
