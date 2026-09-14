# Bonnetje naar Budget sturen vanaf je iPhone

iOS laat een web-app **niet** in het deelmenu verschijnen: Apple ondersteunt de
Web Share Target API niet ([WebKit-bug 194593][wk194593], gemeld in februari
2019, nog steeds open). De AH- of Lidl-app kan dus niet rechtstreeks "delen met
Budget". De omweg is een **Shortcut** die het bonnetje op het klembord zet en de
app opent, waarna je in de app één keer op *Plakken* tikt.

Dit bestand beschrijft hoe je die Shortcut bouwt, wat de app ermee doet en waar
de bekende beperkingen zitten. Alles hieronder is gecontroleerd in september
2026; Apple verandert dit soort gedrag regelmatig.

---

## 1. De Shortcut "Naar Budget"

Maak in de app **Opdrachten** (Shortcuts) een nieuwe opdracht met de naam
**Naar Budget** en zet deze acties eronder elkaar:

1. **Ontvang [PDF's, Afbeeldingen] uit [Deelblad]**
   - Tik bovenaan op de opdrachtnaam → **Details** → zet **Toon in deelblad**
     aan.
   - Tik op *Ontvangen type* en vink alleen **Afbeeldingen** en **PDF's** aan.
     Zet **Bij geen invoer** op *Vraag om foto's*.
2. **Als** · *Invoer* · **is van type** · **PDF**
   - **Maak afbeelding van PDF** — invoer: *Opdrachtinvoer*.
     Tik op *Toon meer* en zet **Pagina's** op **Alle**, en **Kleurruimte** op
     *RGB*. (Resolutie mag op de standaardwaarde blijven; 150 dpi is ruim
     voldoende voor een kassabon.)
   - **Anders**
     - *(niets — een afbeelding gaat ongewijzigd door)*
   - **Eind als**
3. **Kopieer naar klembord** — invoer: het resultaat van stap 2.
   - Tik op *Toon meer* en zet **Verval op** uit, zodat het klembord niet al
     leeg is voordat je in de app op *Plakken* tikt.
4. **Open URL** · `https://floriandekker.github.io/FinanceTracker/bon?paste=1`

Gebruik: in de AH- of Lidl-app op **Deel** tikken → **Naar Budget** kiezen →
Budget opent op het bonnetjes-scherm → één tik op **Plakken**.

### Belangrijk: "Open URL" opent Safari, niet de geïnstalleerde web-app

iOS kent geen *link capturing* voor web-apps op het beginscherm: elke
`https://`-link opent in de standaardbrowser, ook als hij binnen de scope van de
geïnstalleerde PWA valt. De Shortcut hierboven opent Budget dus **in Safari**.
Dat werkt prima (het klembord en de app werken hetzelfde), maar je zit niet in
de geïnstalleerde app en dus ook niet in dezelfde opslag als de app op je
beginscherm — Safari en de standalone web-app delen op iOS wél dezelfde
IndexedDB voor dezelfde origin, dus je bonnen komen op de juiste plek terecht.

Twee alternatieven, met hun haken en ogen:

| Variant | Opent de PWA? | Kan naar `/bon`? | Betrouwbaarheid |
|---|:--:|:--:|---|
| **Open URL** met `https://…/bon?paste=1` | nee (Safari) | ja | stabiel |
| **Open app** → kies de web-app *Budget* | ja | nee (altijd de startpagina) | stabiel sinds iOS 16.4 |
| **Open URL** met `webapp://floriandekker.github.io/FinanceTracker/bon` | ja | nee (pad wordt genegeerd) | ongedocumenteerd; werkte in 2025, meldingen dat het in 2026 stukging |

Advies: begin met **Open URL** (stap 4 hierboven). Wil je per se in de
geïnstalleerde app landen, vervang stap 4 dan door **Open app → Budget** en laat
de app bij het opstarten zelf kijken of er een afbeelding op het klembord staat.

---

## 2. Wat de app straks doet (vijf regels)

1. De route `/bon?paste=1` toont meteen een grote knop **Plakken** — lezen van
   het klembord mág alleen tijdens een user-gesture, dus nooit automatisch bij
   het laden van de pagina.
2. Bij die tik roept de app `navigator.clipboard.read()` aan; Safari toont daar
   bovenop nog een eigen **Plak**-knopje dat je moet bevestigen (Safari
   implementeert de `clipboard-read`-permissie niet, maar toont deze
   eenmalige bevestiging).
3. Uit de `ClipboardItem`s pakt de app het eerste type dat met `image/` begint
   (`item.getType(type)` → `Blob`), zodat zowel `image/png` als een eventuele
   `image/jpeg` werkt.
4. De blob gaat door `downscaleImage(blob, { maxSide: 1600 })` en daarna naar
   `extractReceipt({ images: [...] })`; het resultaat toont de app ter controle
   vóór het opslaan.
5. Als vangnet luistert hetzelfde scherm ook op het `paste`-event (⌘V of
   *Plakken* uit het systeemmenu); dat pad heeft geen extra bevestiging nodig
   omdat de plakactie zélf de toestemming is.

---

## 3. Bekende beperkingen

- **Geen deelmenu-integratie.** Web Share Target werkt niet op iOS
  ([WebKit 194593][wk194593], status `NEW`, laatste activiteit mei 2026). Op
  Android Chrome kan dit later wél via `share_target` in het manifest.
- **PDF via het klembord werkt niet.** WebKit ondersteunt bij het klembord
  alleen `text/plain`, `text/html`, `text/uri-list` en **`image/png`**
  ([WebKit-blog over de Async Clipboard API][wkclip]). `application/pdf` staat
  daar niet bij. Daarom zet de Shortcut de PDF eerst om naar een afbeelding.
- **`image/jpeg` via het klembord is onzeker.** Alleen `image/png` is
  gegarandeerd; JPEG stond in 2020 nog op de WebKit-wensenlijst. De app filtert
  daarom op `type.startsWith('image/')` in plaats van hard op `image/png`.
- **Klembord lezen in de geïnstalleerde PWA (standalone) is niet hard
  bevestigd.** Er is geen bekende blokkade en compatibiliteitstabellen zeggen
  dat het werkt, maar er is geen expliciete bron voor `clipboard.read()` met een
  afbeelding in standalone-modus. Uitproberen op het toestel is de enige manier
  om het zeker te weten. Dat is nog een reden om het `paste`-event als vangnet
  te houden.
- **Meerdere pagina's.** *Maak afbeelding van PDF* met **Pagina's: Alle** levert
  bij een PDF van meerdere pagina's meerdere afbeeldingen, maar het klembord
  houdt er in de praktijk maar één vast. AH-bonnen zijn één pagina, dus dat is
  hier geen probleem; voor lange bonnen is de camera-route met "Nog een stuk"
  bedoeld.
- **Lange bonnen uit een app-schermafbeelding.** Een Lidl-Plus-schermafbeelding
  is ongeveer 1206 × 3900 px. Die in één keer naar 1600 px langste zijde
  schalen maakt hem 490 px breed en dat kost leesbaarheid; de app knipt zo'n
  afbeelding daarom in twee overlappende stukken die elk apart verkleind worden
  en samen in één model-aanroep gaan.

---

## 4. HEIC-foto's

Kies je in de app een foto uit je fotobibliotheek via
`<input type="file" accept="image/*">`, dan converteert iOS een HEIC-foto in de
meeste gevallen zelf naar JPEG voordat de pagina het bestand krijgt. Dat gedrag
is echter **niet gegarandeerd**:

- Zet je `image/heic` in de `accept`-lijst, dan levert Safari 17+ juist wél
  HEIC — en er is een gemelde bug waarbij Safari dan zelfs een origineel JPEG
  naar HEIC omzet. Neem `image/heic` dus **niet** op in `accept`.
- Voor `accept="image/*"` specifiek is er geen autoritatieve Apple-documentatie;
  meldingen spreken elkaar tegen. Behandel HEIC daarom als iets dat kán
  binnenkomen.
- De camera-instelling *Formaten → Meest compatibel* laat de iPhone sowieso in
  JPEG opslaan; met *Hoge efficiëntie* wordt het HEIC.

De app dekt dit af: `image.js` heeft `isWaarschijnlijkHeic(file)` en de
canvas-route valt bij een niet-decodeerbaar bestand terug op een begrijpelijke
Nederlandse foutmelding in plaats van een lege afbeelding.

---

[wk194593]: https://bugs.webkit.org/show_bug.cgi?id=194593
[wkclip]: https://webkit.org/blog/10855/async-clipboard-api/
