# Lunchly 🍽️

**Tinder fürs Mittagessen.** Zwei Personen swipen durch 150 Gerichte aus aller Welt. Wenn beide nach rechts swipen, ist es ein **Lunch-Match**.

## Features

- **150 Gerichte** aus Europa, Asien, Orient, Afrika und Amerika. Jede Karte hat Herkunft & Geschichte, eine Besonderheit, eine witzige Tagline und Tags (veggie, vegan, scharf …)
- **Dessert-Bonus-Swipes:** 25 Desserts werden ab und zu zufällig in die Runde gemischt, für beide Personen an derselben Stelle
- **Histamin-Barometer (1–10)** auf jeder Karte. In der Detailansicht gibt es eine Tachonadel, eine Erklärung, woher der Wert kommt, und einen Bestell-Tipp („ohne Parmesan“, „Sauce weglassen“ …). Für die Person mit Histamin-Intoleranz: ✓ tauglich / ≈ mit Anpassung / ✗ eher nicht
- **Optionaler Histamin-Filter:** nur Gerichte bis Stufe X. Standard: aus, alle essen normal und sehen trotzdem den Wert
- **Tinder-Logik:** Swipe links (Nö), rechts (Lecker), hoch (★ Heißhunger = Super-Like, 3 pro Runde), Rückgängig, „It's a Match“-Popup
- **Zwei Spielmodi**
  - *Ein Handy:* Person 1 swipt und gibt das Handy weiter. Person 2 sieht Matches live.
  - *Zwei Handys:* Einladungs-Link oder Code per WhatsApp schicken. Beide bekommen dieselbe Runde (gleicher Seed), die Swipes werden als kurzer Code ausgetauscht. **Kein Server, kein Login.**
- **Ergebnis:** Top-Match (bei Gleichstand gewinnt das histaminärmere Gericht), Lunch-Roulette, Kompatibilitäts-Score, Dessert-Matches und Kompromiss-Ideen, falls es kein Match gibt
- PWA: installierbar auf dem Homescreen, funktioniert offline, Light- und Dark-Mode, Tastatur (← → ↑ i ⌫)

## Starten

Reine statische Web-App ohne Build-Step:

```bash
npx serve .        # oder: python3 -m http.server
```

Danach http://localhost:3000 öffnen. Für GitHub Pages reicht es, den Branch zu veröffentlichen.

**Single-File-Version** (alles in einer HTML-Datei, z. B. zum Verschicken):

```bash
node tools/build-standalone.mjs   # → dist/lunchly.html
```

## Struktur

```
index.html              App-Shell
css/style.css           Design (Tokens, Light/Dark)
js/app.js               Logik: Deck, Swipes, Matching, Codes, Rendering
js/data/dishes-*.js     150 Gerichte (Europa, Asien, Welt)
js/data/desserts.js     25 Dessert-Bonus-Karten
sw.js, manifest…        PWA / Offline
tools/                  Build-Skript für die Single-File-Version
```

Ein Gericht hinzufügen: einfach ein Objekt in `js/data/dishes-*.js` ergänzen (Schlüssel stehen oben in `dishes-europa.js`).

## Hinweis zum Histamin-Barometer

Die Werte sind **Richtwerte** und basieren auf typischen Zutaten, angelehnt an die SIGHI-Verträglichkeitsliste. Entscheidend sind z. B. gereifter Käse, Wurst, Fischkonserven, Fermentiertes, Tomate, Spinat, Alkohol und Histamin-Liberatoren wie Zitrus oder Kakao. Rezepte und die individuelle Verträglichkeit sind unterschiedlich. **Das ist keine medizinische Beratung.**
