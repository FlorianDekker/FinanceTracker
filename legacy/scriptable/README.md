# Legacy: Scriptable-scripts

Dit was de oorspronkelijke implementatie van de budget-tracker: een verzameling
iOS-scripts voor de app [Scriptable](https://scriptable.app), inclusief
homescreen-widgets, import van ABN AMRO-transacties en losse hulpscripts.

De React-PWA in `src/` heeft deze scripts volledig vervangen.

De categorisatie-logica is hieruit geport: de regels leven nu in
`src/constants/rules.js` en de bijbehorende matching in `src/utils/categorizer.js`.

Deze bestanden worden niet meer onderhouden en doen niet mee in de build of de
lint (zie de ignores in `eslint.config.js`). Ze staan hier puur als referentie.
