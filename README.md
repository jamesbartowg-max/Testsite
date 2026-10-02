# Lunchly 🍽️

**Tinder fürs Mittagessen von morgen.** Zwei Personen swipen jeden Tag auf ihrem eigenen Handy durch 15 Gerichte. Was beide nach rechts swipen, ist ein **Match** und landet morgen auf dem Teller.

## Features

- **Pool von 150 Gerichten** (Hausmannskost, Pasta & Pizza, Asien, Tex-Mex …). Jede Karte hat Herkunft & Geschichte, eine Besonderheit, eine witzige Tagline und Tags (veggie, vegan, scharf …)
- **15 Gerichte pro Tag:** Ein Zufallsgenerator stellt jeden Tag 15 Gerichte zusammen
- **Blacklist:** Gerichte, die schon dran waren, pausieren 7 Tage (`BLACKLIST_DAYS` in `js/app.js`) und kommen erst danach wieder in den Zufallsgenerator
- **Ein Handy pro Person:** Einmal per Einladungs-Link koppeln. Beide Handys berechnen aus dem gemeinsamen Kopplungs-Seed und dem Datum **dieselben 15 Gerichte**, ganz ohne Server oder Login
- **Live-Abgleich (Supabase):** Ist `js/config.js` ausgefüllt, sehen beide Handys automatisch die Swipes, den Fortschritt, die Wahl fürs Mittagessen, die Namen und das Wunschbuch der anderen Person. Kein Link-Verschicken nötig (Einrichtung siehe unten)
- **Ohne Server:** Ohne Supabase-Konfiguration schickt man nach dem Swipen seine Swipes als Link (z. B. per WhatsApp). Was beide mögen, ist ein Match fürs Mittagessen am nächsten Tag
- **Histamin-Barometer (1–10) bei jedem Gericht**, fest angezeigt, mit Tachonadel, Erklärung und Bestell-Tipp
- **Dessert-Bonus-Swipes:** An manchen Tagen werden 1–2 von 25 Desserts zufällig eingemischt
- **Tinder-Logik:** Swipe links (Nö), rechts (Lecker), hoch (★ Heißhunger = Super-Like, 1 pro Tag), Rückgängig, Match-Popup
- **Ergebnis:** Top-Match (Heißhunger zählt doppelt, bei Gleichstand gewinnt das histaminärmere Gericht), „Das gibt's morgen“, Lunch-Roulette, Kompromiss-Ideen
- **Onboarding nur beim ersten Start:** Willkommen → Profil (Vorname, optional Profilfoto) → Koppeln (jemanden einladen oder Einladung annehmen). Wer per Link eingeladen wird, landet direkt beim Profil. Profil später über das Menü bearbeitbar
- **Sterne:** Jedes Gericht hat 5 Sterne, die sich füllen, je öfter es gewählt wurde (ab 1, 2, 3, 5 und 8 Wahlen). Die Top 3 bekommen eine Platzierung (#1, #2, #3), dazu die Liste „Eure Lieblingsgerichte“. Die Wahl des Tages wird über den Swipe-Link mit dem anderen Handy abgeglichen
- **Untere Navigation** wie bei Airbnb: Swipen · Morgen · Wunschbuch · Profil
- **Wunschbuch:** Rezepte, Restaurants, Links und Ideen speichern, filtern, bearbeiten, löschen. Jedes Gericht lässt sich mit „Ins Wunschbuch“ direkt übernehmen
- **Kalorien & Tagesbilanz:** Jedes Gericht hat einen Kalorien-Schätzwert pro Portion. Ist das Essen für morgen entschieden, zeigt die Tagesbilanz, wie viel man am Rest des Tages noch essen kann, ohne zuzunehmen (Tagesbedarf nach Mifflin-St-Jeor aus Geschlecht, Alter, Größe, Gewicht, Aktivität; Ziel „halten“ oder „leicht abnehmen“), Umschalter Heute/Morgen. Ein gematchtes Dessert zählt automatisch mit (Matches lassen sich nicht herausrechnen). Frühstück, Snacks, Abendessen und Getränke kann man eintragen, damit man die restlichen Kalorien des Tages im Blick behält
- **Erinnerung um 18:00:** Ein Popup erinnert daran, das Match für morgen zu „catchen“, solange man noch nicht fertig geswipt hat (einmal pro Tag, im Profil abschaltbar). Ist die App im Hintergrund geöffnet und die Mitteilungs-Berechtigung erteilt, kommt sie als System-Benachrichtigung
- **Match-Animation:** Der pinke Screen ploppt aus der Kamera (ohne Nachfedern), das Herz dreht sich von hinten heran und pocht, „It's a Lunch!“ wird mit Schwung geschrieben. Beim Schließen zieht sich alles ins weiße Herz zurück und das Herz fällt unten aus dem Bild. Läuft in der App nativ (CSS/SVG), dazu gibt es dieselbe Choreografie als Remotion-Video
- **Startscreen:** Die Gerichtskarten ploppen nacheinander aus dem Stapel und die vordere Karte deutet einen Wisch an. Beim App-Start ploppt auch der Swipe-Stapel herein
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

## Live-Abgleich mit Supabase einrichten

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen.
2. Im Dashboard unter **SQL Editor** den Inhalt von `supabase/schema.sql` einfügen und ausführen.
3. Unter **Project Settings → API** die **Project URL** und den **anon public key** kopieren und in `js/config.js` eintragen:

```js
window.LUNCHLY_CONFIG = {
  supabaseUrl: "https://xyzcompany.supabase.co",
  supabaseAnonKey: "eyJhbGciOi…",
};
```

Fertig. Beide Handys gleichen sich dann sofort (Realtime) und zusätzlich alle 45 Sekunden ab. Der anon-Key darf öffentlich sein: Die Tabellen sind per Row Level Security gesperrt, die App kommt nur über Funktionen an die Daten, und jede Funktion verlangt die 20-stellige Kopplungs-ID, die nur die beiden Handys kennen.

Hinweis: Die 18-Uhr-Erinnerung erscheint, wenn die App geöffnet ist oder im Hintergrund läuft. Für eine Push-Nachricht bei komplett geschlossener App braucht es zusätzlich Web Push (z. B. Supabase Edge Function mit Cron und VAPID-Schlüsseln).

## Struktur

```
index.html                        App-Shell
css/style.css                     Design (Tokens, Light/Dark)
js/app.js                         Logik: Deck, Swipes, Matching, Live-Abgleich, Rendering
js/config.js                      Supabase-Zugangsdaten (optional)
js/vendor/supabase.js             supabase-js (MIT), wird nur mit Konfiguration geladen
supabase/schema.sql               Datenbank-Schema für den Live-Abgleich
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

In der App läuft die Match-Animation nativ (CSS und SVG), damit sie nahtlos ein- und ausblendet. Dieselbe Choreografie gibt es als Remotion-Video, z. B. für Präsentationen, Social Media oder den App-Store: Code in `video/`, fertige Videos in `media/` (hell und dunkel, je MP4 und WebM, 5 Sekunden).

```bash
cd video
npm install
npm run studio     # Animation im Browser bearbeiten und Vorschau ansehen
npm run render     # media/match-intro.mp4 neu rendern
npm run render:dark
```

## Schriften

DM Sans und Yellowtail liegen in `fonts/` (SIL Open Font License) und werden mit der App ausgeliefert. Dadurch startet die App ohne Wartezeit auf Google Fonts und funktioniert offline.

## Hinweis zum Histamin-Barometer

Die Werte sind **Richtwerte** und basieren auf typischen Zutaten, angelehnt an die SIGHI-Verträglichkeitsliste. Entscheidend sind z. B. gereifter Käse, Wurst, Fischkonserven, Fermentiertes, Tomate, Spinat, Alkohol und Histamin-Liberatoren wie Zitrus oder Kakao. Rezepte und die individuelle Verträglichkeit sind unterschiedlich. **Das ist keine medizinische Beratung.**
