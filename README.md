# Lunchly 🍽️

**Tinder fürs Mittagessen von morgen.** Zwei Personen swipen durch 150 Gerichte. Was beide nach rechts swipen, ist ein **Match** und landet morgen auf dem Teller.

## Features

- **150 Gerichte** von Hausmannskost über Pasta & Pizza bis Asien und Tex-Mex. Jede Karte hat Herkunft & Geschichte, eine Besonderheit, eine witzige Tagline und Tags (veggie, vegan, scharf …)
- **Histamin-Barometer (1–10) bei jedem Gericht**, fest angezeigt. In der Detailansicht gibt es eine Tachonadel, eine Erklärung, woher der Wert kommt, und einen Bestell-Tipp („ohne Parmesan“, „Sauce weglassen“ …)
- **Dessert-Bonus-Swipes:** 25 Desserts werden ab und zu zufällig in die Runde gemischt, für beide Personen an derselben Stelle
- **Tinder-Logik:** Swipe links (Nö), rechts (Lecker), hoch (★ Heißhunger = Super-Like, 3 pro Runde), Rückgängig, Match-Popup
- **Zwei Spielmodi**
  - *Ein Handy:* Person 1 swipt und gibt das Handy weiter. Person 2 sieht Matches live.
  - *Zwei Handys:* Link oder Code per WhatsApp schicken. Beide bekommen dieselbe Runde (gleicher Seed), die Swipes werden als kurzer Code ausgetauscht. **Kein Server, kein Login.**
- **Ergebnis:** Top-Match (Heißhunger zählt doppelt, bei Gleichstand gewinnt das histaminärmere Gericht), „Das gibt's morgen“, Lunch-Roulette, Einigkeits-Score, Dessert-Matches und Kompromiss-Ideen
- Design im Airbnb/Tinder-Stil, Light- und Dark-Mode, PWA (installierbar, offline), Tastatur (← → ↑ i ⌫)

## Starten

Reine statische Web-App ohne Build-Step:

```bash
npx serve .        # oder: python3 -m http.server
```

Für GitHub Pages reicht es, den Branch zu veröffentlichen.

**Single-File-Version** (alles in einer HTML-Datei, z. B. zum Verschicken):

```bash
node tools/build-standalone.mjs   # → dist/lunchly.html
```

## Struktur

```
index.html                        App-Shell
css/style.css                     Design (Tokens, Light/Dark)
js/app.js                         Logik: Deck, Swipes, Matching, Codes, Rendering
js/data/dishes-deutschland.js     Hausmannskost DE/AT/CH (60)
js/data/dishes-europa.js          Italien, Europa, Orient (46)
js/data/dishes-international.js   Asien & Amerika (44)
js/data/desserts.js               25 Dessert-Bonus-Karten
sw.js, manifest.webmanifest       PWA / Offline
tools/build-standalone.mjs        Build-Skript für die Single-File-Version
```

Ein Gericht hinzufügen oder ändern: einfach das Objekt in der passenden `js/data/dishes-*.js` bearbeiten (die Schlüssel stehen oben in `dishes-deutschland.js`).

## Hinweis zum Histamin-Barometer

Die Werte sind **Richtwerte** und basieren auf typischen Zutaten, angelehnt an die SIGHI-Verträglichkeitsliste. Entscheidend sind z. B. gereifter Käse, Wurst, Fischkonserven, Fermentiertes, Tomate, Spinat, Alkohol und Histamin-Liberatoren wie Zitrus oder Kakao. Rezepte und die individuelle Verträglichkeit sind unterschiedlich. **Das ist keine medizinische Beratung.**
