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

## Uitbreiding (24 sep 2026): vakantie-subcategorieën en twee waarheden

Besluit met Florian: binnen een vakantie werken we met **subcategorieën van
de categorie Vakantie**, en de twee bronnen (Splitser = wat het jou kostte,
bank = wat er van je rekening ging) blijven zichtbaar naast elkaar.

### 1. Vaste subcategorieën van Vakantie
Standaard-subs (in `src/constants/categories.js` bij `vakantie`, en eenmalig
toegevoegd aan een bestaande Vakantie-categorie die nog géén subs heeft — via
een `ensureTripSubcategories()` die bij het openen van de Vakanties-pagina
draait; bestaande subs nooit overschrijven of hernoemen):

| key | label |
|---|---|
| `vlucht` | Vlucht |
| `vervoer` | Vervoer |
| `overnachting` | Overnachting |
| `eten_drinken` | Eten & drinken |
| `activiteiten` | Activiteiten |
| `boodschappen_vakantie` | Boodschappen |
| `overig_vakantie` | Overig |

De Vakantie-categorie wordt gevonden via key `vakantie`, anders op label
"Vakantie" (hoofdletterongevoelig). Bestaat hij niet: dan niets doen en in de
UI melden dat er geen Vakantie-categorie is.

### 2. Sub raden op omschrijving (puur, getest)
`src/utils/trips/subcategory.js`: `guessTripSub(text)` → sub-key of `overig_vakantie`.
Trefwoorden (NL/EN/FR/DE/ES, lowercase, substring):
- vlucht: vlucht, flight, klm, transavia, ryanair, easyjet, vueling, wizz, lufthansa, airline, airways, luchthaven, airport, schiphol
- vervoer: trein, train, ns , sncf, db , thalys, eurostar, metro, tram, bus, taxi, uber, bolt, huurauto, rental, hertz, sixt, avis, europcar, tol, toll, parkeren, parking, benzine, tank, fuel, veerboot, ferry, ov, fiets, bike
- overnachting: hotel, hostel, airbnb, booking, b&b, camping, appartement, apartment, verblijf, toeristenbelasting, city tax, overnacht
- eten_drinken: eten, diner, dinner, lunch, ontbijt, breakfast, restaurant, cafe, café, koffie, coffee, bar, bier, beer, wijn, wine, pizza, burger, frietje, friet, ijs, gelato, bakker, boulangerie, patisserie, tapas, snack, brunch, borrel, cocktail, drank, proeverij, sushi, streetfood, food, eat
- activiteiten: museum, musea, ticket, entree, entrance, tour, rondleiding, excursie, boot, kayak, kajak, klimmen, huur (zonder auto), concert, theater, show, zwembad, strand, park, tuin, kasteel, castle, kathedraal, cathedral, toren, tower, bezoek, attractie, zoo, aquarium, wellness, spa, sauna, ski, duik, surf
- boodschappen_vakantie: supermarkt, supermarket, albert heijn, jumbo, lidl, aldi, carrefour, spar, monoprix, mercadona, delhaize, colruyt, tesco, sainsbury, rewe, edeka, boodschappen, groceries
Meerdere treffers: de sub met de meeste treffers; gelijkspel → volgorde hierboven.
Geleerde correcties (bestaande `recordEvent`/`categorizeWithLearning` op de
omschrijving) gaan vóór het raden, mits het geleerde in Vakantie ligt; leert
de app iets buiten Vakantie (bijv. Kleding), dan volgen we dat óók — de
gebruiker koos dat bewust.

### 3. Splitser-regels: altijd categorie `vakantie` + geraden sub
Vervangt de huidige fallback-logica in `SplitserImportSheet`: categorie is
altijd de Vakantie-key; sub via geleerd → `guessTripSub(description)`.
Correctie in `TripItemSheet` blijft leren via `recordEvent`.

### 4. Banktransacties in één keer op Vakantie
- `recategorizeTripTransactions(tripId)` in `useTrips.js`: voor elke
  gekoppelde **afschrijving** die nog niet in Vakantie staat: categorie =
  Vakantie, sub = van de gematchte Splitser-regel (`tripItems.matchedTxId`),
  anders `guessTripSub(tx.note)`. Bijschrijvingen (verrekeningen) blijven
  ongemoeid. Lopende declaraties (`isOpenClaim`) ook. Per gewijzigde
  transactie `recordEvent(note, 'vakantie', sub, amount, 'debit', null,
  { was: true, from: oudeCategorie })` zodat de herkenning het onthoudt.
  Retourneert aantal gewijzigd.
- In het vakantiedetail een knop **"Zet gekoppelde uitgaven op Vakantie"**
  (met bevestiging die het aantal noemt); verborgen als er niets te doen is.
- In `TripFormSheet` bij een **nieuwe** vakantie een vinkje "Gekoppelde
  uitgaven op Vakantie zetten" (standaard aan); bij bewerken niet tonen.
  Uitvoeren ná het koppelen en ná een eventuele Splitser-match.
- Nooit automatisch bij het los koppelen van transacties achteraf.

### 5. Twee waarheden in het detail
`tripCosts` levert per (sub)categorie twee bedragen: `mine` (Splitser-aandeel
+ niet-gedekte bankuitgaven, zoals nu) en `bank` (Σ trip-afschrijvingen in die
categorie, incl. gedekte; open declaraties uitgesloten). Sleutel voor de
verdeling: `category|subcategory`; toon het label van de sub als de categorie
Vakantie is, anders het categorielabel. De donut blijft `mine`. Onder de
donut een lijst per rij: label · **Voor jou** · *Bank* (muted). Zonder
Splitser zijn beide kolommen gelijk (bank = mine + verrekeningen); toon dan
alleen één kolom.

### Tests
- `guessTripSub` (per sub minstens twee voorbeelden, o.a. "Museum 1",
  "Koffietje zaterdag", "Toeristenbelasting" → overnachting, "Le pain
  quotidien" → eten_drinken, "Contant" → overig).
- `ensureTripSubcategories`: voegt subs toe aan een Vakantie zonder subs;
  laat een Vakantie met eigen subs ongemoeid; doet niets zonder Vakantie.
- `recategorizeTripTransactions`: gematchte regel wint, bijschrijving en open
  declaratie blijven, learning-event met `was/from`.
- `tripCosts`: `bank` naast `mine` per sleutel; Brugge-fixture doorrekenen.
