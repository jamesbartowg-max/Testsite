# Lunchly 🍽️

**Tinder fürs Mittagessen von morgen.** Zwei Personen swipen jeden Tag auf ihrem eigenen Handy durch 15 Gerichte. Was beide nach rechts swipen, ist ein **Match** und landet morgen auf dem Teller.

## Features

- **Pool von 150 Gerichten** (Hausmannskost, Pasta & Pizza, Asien, Tex-Mex …). Jede Karte hat Herkunft & Geschichte, eine Besonderheit, eine witzige Tagline und Tags (veggie, vegan, scharf …)
- **15 Gerichte pro Tag:** Ein Zufallsgenerator stellt jeden Tag 15 Gerichte zusammen
- **Blacklist:** Gerichte, die schon dran waren, pausieren 7 Tage (`BLACKLIST_DAYS` in `js/app.js`) und kommen erst danach wieder in den Zufallsgenerator
- **Ein Handy pro Person:** Einmal per Einladungs-Link koppeln. Beide Handys berechnen aus dem gemeinsamen Kopplungs-Seed und dem Datum **dieselben 15 Gerichte**, ganz ohne Server oder Login
- **Swipes austauschen:** Nach dem Swipen schickt man seine Swipes als Link (z. B. per WhatsApp). Was beide mögen, ist ein Match fürs Mittagessen am nächsten Tag. Sind die Swipes der anderen Person schon da, poppen Matches live auf
- **Histamin-Barometer (1–10) bei jedem Gericht**, fest angezeigt, mit Tachonadel, Erklärung und Bestell-Tipp
- **Dessert-Bonus-Swipes:** An manchen Tagen werden 1–2 von 25 Desserts zufällig eingemischt
- **Tinder-Logik:** Swipe links (Nö), rechts (Lecker), hoch (★ Heißhunger = Super-Like, 1 pro Tag), Rückgängig, Match-Popup
- **Ergebnis:** Top-Match (Heißhunger zählt doppelt, bei Gleichstand gewinnt das histaminärmere Gericht), „Das gibt's morgen“, Lunch-Roulette, Kompromiss-Ideen
- **Onboarding nur beim ersten Start:** Willkommen → Profil (Vorname, optional Profilfoto) → Koppeln (jemanden einladen oder Einladung annehmen). Wer per Link eingeladen wird, landet direkt beim Profil. Profil später über das Menü bearbeitbar
- **Sterne:** Jedes Gericht hat 5 Sterne, die sich füllen, je öfter es gewählt wurde (ab 1, 2, 3, 5 und 8 Wahlen). Die Top 3 bekommen eine Platzierung (#1, #2, #3), dazu die Liste „Eure Lieblingsgerichte“. Die Wahl des Tages wird über den Swipe-Link mit dem anderen Handy abgeglichen
- **Match-Animation** (Remotion-Video): Der pinke Screen ploppt aus der Kamera, das Herz dreht sich von hinten heran und pocht, „It's a Lunch!“ wird mit Schwung geschrieben
- **Ladebildschirm** mit dem Lunchly-Logo, dessen Dampfstreifen sich in Wellen bewegen
- **Lebendige Details:** Aktions-Buttons wachsen beim Wischen mit und färben sich, Karten rücken animiert nach, das Histamin-Barometer füllt sich, beim Match gibt es Herzregen und eine kurze Vibration (Android), das Match-Herz oben hüpft bei jedem neuen Match
- **Tagesabschluss:** gelikt / Heißhunger / Tage in Folge (Serie) und ein Countdown bis zu den nächsten 15 Gerichten
- Helles Design im Airbnb/Tinder-Stil. Dark Mode nur manuell über den Mond-Button oben rechts (wird auf dem Gerät gespeichert, Systemeinstellung wird ignoriert). PWA (installierbar, offline), Tastatur (← → ↑ i ⌫)

## Einstellungen

Oben in `js/app.js`:

| Konstante | Standard | Bedeutung |
|---|---|---|
| `DAILY_DISHES` | 15 | Gerichte pro Tag |
| `BLACKLIST_DAYS` | 7 | So viele Tage pausiert ein Gericht, nachdem es dran war |
| `SUPERS_PER_DAY` | 1 | Heißhunger-Super-Likes pro Tag |

Wichtig: Beide Handys müssen dieselbe App-Version und dieselben Einstellungen haben, sonst unterscheiden sich die Tagesauswahlen.

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
fonts/                            Schriften (lokal ausgeliefert)
media/                            Match-Animation als Video
video/                            Remotion-Projekt der Match-Animation
tools/build-standalone.mjs        Build-Skript für die Single-File-Version
```

Ein Gericht hinzufügen oder ändern: einfach das Objekt in der passenden `js/data/dishes-*.js` bearbeiten (die Schlüssel stehen oben in `dishes-deutschland.js`).

## Fotos der Gerichte einfügen

Solange ein Gericht kein Foto hat, zeigt die App eine weiße Bildfläche. So kommt ein Foto dazu:

1. Bild in den Ordner `images/gerichte/` legen, z. B. `images/gerichte/rinderrouladen.jpg` (Querformat oder quadratisch, ca. 1200 px breit, JPG oder WebP).
2. Beim Gericht in `js/data/dishes-*.js` das Feld `img` ergänzen:

```js
{ n: "Rinderrouladen mit Blaukraut und Klößen", img: "images/gerichte/rinderrouladen.jpg", … }
```

Das Foto erscheint dann automatisch auf der Swipe-Karte, in der Detailansicht, beim Match und in der Ergebnisliste. Es wird immer formatfüllend zugeschnitten (`object-fit: cover`).

## Match-Animation (Remotion)

Die Animation liegt als Code in `video/` und als fertige Videos in `media/` (hell und dunkel, je MP4 und WebM, ca. 200 KB).

```bash
cd video
npm install
npm run studio     # Animation im Browser bearbeiten und Vorschau ansehen
npm run render     # media/match-intro.mp4 neu rendern
```

## Schriften

DM Sans und Yellowtail liegen in `fonts/` (SIL Open Font License) und werden mit der App ausgeliefert. Dadurch startet die App ohne Wartezeit auf Google Fonts und funktioniert offline.

## Hinweis zum Histamin-Barometer

Die Werte sind **Richtwerte** und basieren auf typischen Zutaten, angelehnt an die SIGHI-Verträglichkeitsliste. Entscheidend sind z. B. gereifter Käse, Wurst, Fischkonserven, Fermentiertes, Tomate, Spinat, Alkohol und Histamin-Liberatoren wie Zitrus oder Kakao. Rezepte und die individuelle Verträglichkeit sind unterschiedlich. **Das ist keine medizinische Beratung.**
