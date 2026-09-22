# Vakanties — ontwerp

Doel: per vakantie zien wat die *jou* kostte, met vlag van het land, per dag en
per categorie. Bron 1 is de bank (ABN-import), bron 2 is Splitser (PDF
"Settlement"), omdat je op reis vaak voor anderen voorschiet en andersom.

## Data (schema v7, al aanwezig in `src/db/db.js`)

```
trips:      ++id, from, to
  { id, name, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', countries: ['FRA', ...],
    note: '', createdAt, splitser: { imported: [{ fileName, at, rows }], myName: 'Florian' } | null }

tripItems:  ++id, tripId, date            // Splitser-regels
  { id, tripId, date: 'YYYY-MM-DD', description, amount, payer, participants: [{ name, share }],
    myShare, category, subcategory, matchedTxId: number | null, source: 'splitser' }

transactions.tripId (index)               // banktransactie hoort bij deze vakantie
```

`accounts`/`accountSnapshots`/`reservations`/`goals` horen bij Vermogen — niet aanraken.

## Land uit de omschrijving

ABN zet bij buitenlandse pinbetalingen `Land: FRA` (ISO-3166 alpha-3) in de
omschrijving; dat staat in `tx.note` (en bij sommige importen in `tx.remi`, dus
we kijken in allebei). Helper `countryOf(tx)` → 'FRA' | null
(regex `/\bLand:\s*([A-Z]{3})\b/`). `NLD` telt als thuis. Vlag: alpha-3 → alpha-2
→ regional-indicator-emoji; naam in het Nederlands. Een kleine tabel met de
~40 gangbare Europese/vakantielanden volstaat, met fallback "🌍 XXX".
Nieuw bestand: `src/utils/trips/country.js` (puur, getest).

## Welke banktransacties horen bij een vakantie?

Bij aanmaken/bewerken scant de app `from − 1 dag` t/m `to + 1 dag` en vinkt voor:
- `countryOf(tx)` is gezet en ≠ NLD;
- `tx.category` is de categorie met key `vakantie` (of label Vakantie);
- bijschrijvingen (`type: 'credit'`) in de periode die geen inkomen zijn
  (categorietype ≠ income) — kandidaat-verrekeningen van reisgenoten.
De gebruiker haalt weg / voegt toe (lijst met checkboxes, ook transacties uit
de periode die niet voorgevinkt zijn, onderaan ingeklapt). Opslaan zet
`tripId`; weghalen zet hem op `null`. Een transactie hoort bij maximaal één
vakantie. Lopende declaraties (`isOpenClaim`) kunnen wél in een vakantie
zitten maar tellen niet mee in de kosten (zie rekenregels).

**Voorstellen** (op de Vakanties-pagina, boven de lijst): cluster transacties
zonder `tripId` met een buitenlands land: sorteer op datum, nieuw cluster
zodra het gat > 3 dagen is óf het land wisselt (Land 'X' en 'Y' binnen 1 dag
= zelfde reis met twee landen; anders splitsen). Toon per cluster: vlaggen,
datums, aantal, totaal → "Vakantie aanmaken" vult het formulier voor.
Puur: `src/utils/trips/suggest.js` (`clusterTrips(txs, { gapDays: 3 })` plus
`suggestTripTransactions(txs, …)` voor het voorvinken in het formulier), getest.

## Splitser-PDF

Bestand kiezen (hergebruik `takeFile` uit `src/utils/fileInput.js`) →
`extractPdfText` uit `src/utils/receipts/pdfText.js` (bestaat; levert regels
per pagina) → `parseSplitserPdf(text)` in `src/utils/trips/splitser.js` (puur, getest
met de tekst uit `docs/voorbeelden/splitser-parijs.txt` — maak dat bestand aan
met onderstaande regels als testfixture).

Structuur van de tekst (zie fixture):
- Kop `Settlement - <naam>` en datum.
- Sectie `Expenses` met kopregel `Payer Description Amount Date Participants`.
- Regel: `<Payer> <Description> €<amount> <DD-MM-YYYY> <Name (€x.xx), Name (€y.yy), ...>`
  Parse van achteren naar voren: eerst de participants (`Naam (€bedrag)` herhaald,
  gescheiden door komma's), dan de datum, dan het bedrag met €, wat overblijft is
  `Payer` (eerste woord) en `Description` (de rest). Bedragen met punt als decimaal.
- Lange omschrijvingen kunnen over twee tekstregels breken; als een regel niet
  matcht, plak hem aan de volgende en probeer opnieuw.
- `Continuing on next page` en herhaalde kopregels overslaan; `Total spent €x` =
  controlegetal (som van amounts moet kloppen, anders waarschuwing).
- Sectie `Balance` (per lid: Balance, Expenses +/−) is een tweede controle:
  `Expenses −` van mij moet gelijk zijn aan Σ myShare.

Mijn naam: instelling `splitserName` (standaard 'Florian'); bij de eerste import
kiezen uit de gevonden namen als de standaard niet voorkomt. `myShare` = het
aandeel achter mijn naam (0 als ik niet meedeed).

Categorie per regel via `categorizeWithLearning(description, amount, 'debit')`
uit `src/utils/categorizer.js`; corrigeren in de lijst (CategoryPicker) en die
correctie leert via `recordEvent` net als in ImportPage. Standaard-fallback:
categorie `vakantie`.

Dubbele import (zelfde PDF nog eens, of een nieuwere versie): regels matchen op
`date + description + amount`; bestaande blijven (met hun categorie/matching),
nieuwe komen erbij, verdwenen regels worden verwijderd. Meld het resultaat.

## Bank ↔ Splitser matchen

Een Splitser-regel waar ík de betaler ben, is (meestal) ook een bankregel.
Match: `tx.tripId === trip.id`, `type === 'debit'`, `|tx.amount − item.amount| ≤ 0.01`,
datum binnen ±2 dagen; bij meerdere kandidaten de dichtstbijzijnde datum. Zet
`item.matchedTxId`. Handmatig aanpasbaar in het regel-detail ("Welke
banktransactie is dit?"): lijst van trip-transacties, of "geen".

## Rekenregels (puur, `src/utils/trips/costs.js`, getest)

```
splitserShare   = Σ item.myShare
bankNotCovered  = Σ tx.amount over trip-debits die door géén item gematcht zijn
                  en niet isOpenClaim (voorgeschoten werkkosten tellen niet)
myCost          = splitserShare + bankNotCovered
bankOut         = Σ trip-debits (excl. open claims)
bankIn          = Σ trip-credits (verrekeningen)
bankNet         = bankOut − bankIn
reconcile       = bankNet − myCost      // ≈ 0 als alles verrekend is
```
Per categorie: Splitser-regels op hun eigen categorie met `myShare`; niet-
gedekte bankregels op hun categorie met `amount`. Per dag idem op datum.
Zonder Splitser: `myCost = bankNet`.

## Schermen

- `/vakanties` (`src/pages/TripsPage.jsx`): voorstellen-blok (indien clusters),
  daaronder kaartjes per vakantie (vlag(gen), naam, periode, dagen, `myCost`,
  €/dag), nieuwste eerst; knop "+ Vakantie".
- Detail als **sheet** (geen subroute: `App.jsx` kent alleen `/vakanties`): kop met vlag, periode, dagen;
  tegels `Voor jou` / `Per dag` / `Bank netto` (+ verschil met uitleg);
  donut per categorie (hergebruik stijl van `SpendingDonut`/`GroceryGroupsChart`,
  kleuren via `catMap`); tabs **Regels** (Splitser + niet-gedekte bank, gemengd
  op datum, label "Splitser"/"bank", tik = categorie/matching) en **Bank**
  (alle gekoppelde transacties, incl. gedekte en verrekeningen, met badge);
  knoppen: Splitser-PDF importeren, Transacties kiezen, Bewerken, Verwijderen
  (transacties blijven bestaan, `tripId` → null).
- Formulier: naam, van/tot, landen (auto uit de voorgevinkte transacties;
  aanpasbaar via een landenkiezer met vlaggen), notitie.
- Transactieformulier: als `tx.tripId` gezet is een regeltje "🧳 <vakantienaam>"
  (alleen tonen, wijzigen via Vakanties). Bestand `TransactionForm.jsx` mag je
  hiervoor minimaal aanpassen.

## Backup

`trips`, `tripItems` staan al in `BACKUP_TABLES`. Bij herstel in modus
samenvoegen verschuiven trip-id's: remap `transactions.tripId` en
`tripItems.tripId` net zoals `claimBatchId` nu wordt geremapt in
`src/utils/backup.js` (lees hoe dat daar gaat en volg hetzelfde patroon;
test in `tests/unit/backup.test.mjs`).

## Gebouwd — waar staat wat

```
src/utils/trips/country.js    countryOf / isForeign / flagOf / countryName / flagsOf
src/utils/trips/suggest.js    clusterTrips, suggestTripTransactions, dayDiff/tripDays/shiftDate
src/utils/trips/splitser.js   parseSplitserPdf, shareOf/totalShareOf, checkMyShare, diffSplitserRows
src/utils/trips/costs.js      tripCosts (alle rekenregels), suggestMatches (bank ↔ Splitser)
src/hooks/useTrips.js         queries + mutaties (createTrip, setTripTransactions,
                              importSplitserRows, autoMatchTripItems, setTripItemMatch,
                              splitserName-instelling)
src/pages/TripsPage.jsx       voorstellen + kaartjes
src/components/trips/         TripFormSheet, TripTransactionsSheet, CountryPickerSheet,
                              TripDetailSheet, TripItemSheet, TripCategoryDonut,
                              SplitserImportSheet
tests/unit/trips.test.mjs, trips-splitser.test.mjs, trips-flow.test.mjs
```

Kleine keuzes die de spec openliet:
- `parseSplitserPdf` geeft naast de regels ook `members`, `balance`, `settledOn`,
  `from`/`to`, `sumAmounts` en `warnings` terug; de importsheet toont beide
  controles ("Total spent" en `Expenses −` uit de balans) als vinkjes.
- Het matchen bank ↔ Splitser (`suggestMatches`) staat in `costs.js`, want het
  hoort bij de vraag "welke bankregel is al gedekt?".
- Bij een tweede import lopen ook de aandelen van bestaande regels mee als je
  een andere naam kiest; categorie en handmatige koppeling blijven staan.
- Een Splitser-import accepteert ook een `.txt` met dezelfde tekst — handig om
  een settlement te controleren zonder PDF.
- Zonder Splitser-regels tellen bijschrijvingen in de verdeling per categorie/dag
  als negatief bedrag; de donut toont alleen de positieve rijen.

## Buiten scope (nu)

Meerdere valuta (Splitser rekent al in €), foto's, delen met reisgenoten.
