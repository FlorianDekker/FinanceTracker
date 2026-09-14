# Bonnetje delen vanaf Android

Android/Chrome ondersteunt, in tegenstelling tot iOS/Safari, de **Web Share
Target API**: een geïnstalleerde PWA kan zichzelf in het systeem-deelmenu
zetten en daar bestanden (foto's, PDF's) ontvangen. Op iOS bestaat dit niet
([WebKit-bug 194593][wk194593], gemeld in 2019, nog steeds open) — daar is de
Shortcut-plakroute uit [`docs/ios-shortcut-bon.md`](./ios-shortcut-bon.md) de
oplossing. Dit bestand beschrijft de Android-variant.

---

## 1. Wat er in het manifest staat

`vite.config.js` voegt aan het gegenereerde web-manifest een `share_target` toe:

```js
share_target: {
  action: '/FinanceTracker/bon',
  method: 'POST',
  enctype: 'multipart/form-data',
  params: { files: [{ name: 'receipt', accept: ['image/*', 'application/pdf'] }] },
}
```

Zodra de PWA geïnstalleerd is ("Toevoegen aan startscherm" in Chrome), neemt
Android dit over in het OS: Budget verschijnt in het deelmenu van elke app die
foto's of PDF's kan delen (Foto's, een bestandsbeheerder, de AH-app, enzovoort).

## 2. De keten van delen tot bon

1. Gebruiker kiest in het deelmenu van een andere app **Budget**.
2. Chrome doet een `POST multipart/form-data` naar `/FinanceTracker/bon`, met
   het gedeelde bestand onder het formulierveld `receipt`.
3. De service worker (`public/sw-share.js`, ingeladen via
   `importScripts('sw-share.js')` in het door Workbox gegenereerde `sw.js` —
   zie de toelichting in `vite.config.js`) vangt dit `fetch`-event op, omdat
   het een `POST` is waarvan het pad eindigt op `/FinanceTracker/bon`.
4. De worker leest `event.request.formData()`, haalt alle `File`-objecten op
   (in elk geval `receipt`, als vangnet ook eventuele andere velden) en zet ze
   in een **eigen** IndexedDB-database `FinanceTrackerShare`, store
   `shareInbox` (`{ file, name, type, receivedAt }`, `id` autoincrement). Dit
   is bewust niet de Dexie-beheerde `BudgetTracker`-database: Dexie
   onderhandelt zelf over schemaversies, en een tweede onafhankelijke schrijver
   zou daar doorheen kunnen fietsen.
5. De worker antwoordt met een **303-redirect** naar `/FinanceTracker/bon?share=1`
   (of `...&shareError=1` als er iets misging, zodat de gebruiker nooit op een
   witte pagina strandt — een POST-response moet volgens de Share Target-spec
   sowieso een 303 naar een GET-pagina zijn).
6. De app opent op `/bon` met `?share=1` in de URL. `src/utils/receipts/shareInbox.js`
   (`takeShareInbox()`) leest de inbox-store, maakt hem leeg en geeft de
   bestanden terug; `ReceiptsPage` verwerkt ze zoals elke andere geüploade
   bon-afbeelding/PDF.

## 3. Handmatig testen

Web Share Target laat zich niet in de browser-devtools of in Playwright
simuleren (het OS-deelmenu en de bijbehorende intent zitten buiten het bereik
van de browser-automatisering) — er is geen manier om dit via geautomatiseerde
tests te triggeren. Testen moet op een echt Android-toestel (of een Android-
emulator met Chrome):

1. Open de site in Chrome op Android en installeer de PWA via het menu
   **Toevoegen aan startscherm** (of de install-prompt).
2. Open een willekeurige app met foto's (bijv. Foto's/Google Foto's), kies een
   bonfoto en tik op **Delen**.
3. **Budget** moet in de lijst met apps staan — kiezen opent de PWA op
   `/FinanceTracker/bon?share=1`.
4. Controleer dat de bonfoto verschijnt zodra de pagina laadt (via
   `takeShareInbox()`), zonder dat er iets in het deelmenu-formulier hoefde te
   worden ingevuld.

Werkt de PWA nog niet als installeerbare app (bijv. tijdens lokale ontwikkeling
via `vite dev`), dan verschijnt Budget niet in het deelmenu — `share_target`
werkt alleen voor een via het manifest geïnstalleerde app, niet voor een
gewone open tab.

---

[wk194593]: https://bugs.webkit.org/show_bug.cgi?id=194593
