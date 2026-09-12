---
name: schaefchen-aenderung
description: Pflichtablauf für jede Code-Änderung am Schäfchen-Repository - Fassungsanhebung mit allen Fundstellen, Integrationstests gegen eine echte Datenbank, Gegenprobe für neue Absicherungen, und die Regeln für mehrere gleichzeitig arbeitende Agenten. Nutze diesen Skill bei JEDER Änderung an api/, frontend/ oder database/ in diesem Repository - auch bei einer einzelnen CSS-Zeile, auch bei einem reinen Test, auch wenn die Aufgabe klein wirkt. Ebenso, wenn du einen Teilauftrag an einen Subagenten vergibst, wenn du Tests fährst, wenn du eine Fassung anhebst oder wenn du ein Ergebnis als "grün" melden willst.
---

# Änderungen am Schäfchen-Repository

Lies zuerst `AGENTS.md` — dort stehen die fachlichen Hausregeln (Einfach vor
komplex, deutsche Kommentare mit dem WARUM, Historie statt Löschen,
Mandantentrennung). Dieser Skill ergänzt sie um den **Ablauf**: was zu tun
ist, damit eine Änderung wirklich ankommt und wirklich geprüft ist.

Jede Regel hier steht, weil sie schon einmal verletzt wurde und Schaden
angerichtet hat. Die Begründungen sind keine Verzierung — wer sie versteht,
erkennt auch den nächsten Fall, den dieser Text nicht kennt.

## 1. Ein grüner Testlauf beweist oft gar nichts

Die Integrationstests in `api/tests/` **überspringen sich stillschweigend**,
wenn keine Datenbank erreichbar ist:

```js
const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;
```

Wer neue Integrationstests schreibt und danach `npm test` fährt, sieht grün —
über seine eigenen neuen Tests sagt das **nichts**. Genau so ist ein Test
durchgerutscht, der gegen eine echte Datenbank mit 409 fehlschlug.

Achte deshalb immer auf die Zeile `# skipped`. Steht dort nicht `0`, hast du
nicht getestet, was du glaubst.

So läuft es richtig:

```sh
export API_INTEGRATION_TEST=true
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 \
       POSTGRES_DB=schaefchen POSTGRES_USER=schaefchen POSTGRES_PASSWORD=…
export API_DB_USER=schaefchen_api_login API_DB_PASSWORD=…
npm --prefix api run test:coverage
```

Die Suiten im Einzelnen:

| Bereich | Befehl |
|---|---|
| Datenbank | `sh database/scripts/run-sql-directories.sh database/preflight database/migrations database/seeds database/tests` |
| API | `npm --prefix api run test:coverage` |
| Oberfläche | `node frontend/tests/smoke.mjs && node --test frontend/tests/*.test.mjs` |

**In `frontend/` gibt es kein `package.json`.** `npm test` scheitert dort mit
`ENOENT` — das ist kein Fehler deiner Änderung. Nimm die zwei Befehle oben
oder `make frontend-test`.

Migrationen immer **zweimal** hintereinander fahren: Sie müssen idempotent
sein, und der zweite Lauf ist der einzige Nachweis dafür.

## 2. Die Gegenprobe: Ein Test, der nie fehlschlägt, ist kein Test

Wer eine neue Absicherung einbaut, hat zwei Dinge zu zeigen — nicht eins:

1. Der Test ist grün, wenn der Code stimmt.
2. Der Test **schlägt an**, wenn man die Absicherung absichtlich bricht.

Punkt 2 wird meistens vergessen, und dann steht eine Zusicherung im Baum, die
nie etwas fangen wird. Echte Beispiele aus diesem Projekt:

- Ein Test prüfte alles *im* Kasten „Diese Zuordnungen fehlen" — Überschrift,
  Zähler, Knöpfe — aber nicht, ob der Kasten überhaupt **aufgeht**. Er ließ
  sich dauerhaft unsichtbar schalten, und alles blieb grün.
- Ein Test prüfte die vorgelagerten `if`-Schranken eines Formulars, aber nicht,
  **was tatsächlich im Anfragerumpf landet**. Die Datenbank hätte abgelehnt.

Und prüf beim Brechen nach, ob dein Bruch die Datei **wirklich verändert
hat** (`diff`). Ein `sed`, dessen Muster nicht greift, liefert ein grünes
Ergebnis, das wie eine Lücke aussieht — oder wie Sicherheit, wo keine ist. Ich
habe mir damit schon zweimal selbst einen falschen Befund gemeldet.

Wo sich eine Regel **mechanisch aus dem Quelltext ableiten** lässt, ist das
einer Aufzählung von Namen weit überlegen: Eine Handliste fängt die bekannten
Fälle, eine abgeleitete Menge fängt den nächsten. Beispiel in
`frontend/tests/smoke.mjs`: Jede Schaltfläche, die irgendwo
`disabled = !navigator.onLine` gesetzt bekommt, muss in
`updateConnectionState()` einen Rückweg haben — beide Mengen kommen per Regex
aus der Datei selbst. Vorher fehlten dort fünf Knöpfe, die nach einem
Speicherversuch ohne Netz bis zum Neuladen tot blieben.

## 3. Fassung anheben — sonst kommt die Änderung nie an

Die Dateien hängen im Dienst-Worker an `?v=`-Parametern. **Ohne neue
Fassungsnummer lädt jedes Telefon weiter die alte Datei aus dem
Zwischenspeicher.** Das gilt auch für eine einzelne geänderte CSS-Zeile: Die
Reparatur erreicht sonst niemanden.

Finde die Fundstellen, statt sie aus dem Gedächtnis aufzuzählen:

```sh
ALT=0.44.46; NEU=0.44.47
DATEIEN=$(grep -rl "${ALT}" --include=* . | grep -v node_modules | grep -v '\.git/' \
          | grep -v "database/migrations\|database/tests\|CHANGELOG\|PROJECT_STATUS")
for f in $DATEIEN; do
  sed -i "s/${ALT//./\\\\.}/${NEU//./\\\\.}/g" "$f"   # zuerst die maskierte Form
  sed -i "s/${ALT}/${NEU}/g" "$f"                      # dann die schlichte
done
grep -rn "${ALT}" --include=* . | grep -v node_modules | grep -v '\.git/' \
  | grep -v "database/migrations\|database/tests\|CHANGELOG\|PROJECT_STATUS"
```

**Die maskierte Form ist die Falle.** In `frontend/tests/smoke.mjs` stehen
Fassungsnummern in regulären Ausdrücken als `0\.44\.46`. Ein `sed`, das nur
`0\.44\.46` als Muster benutzt, trifft `0.44.46` — aber nicht `0\.44\.46` im
Text. Beim Sprung auf 0.44.40 ist genau das passiert, und der Fehler fiel
erst in der CI auf.

Dazu gehören außerdem:

- `CACHE_NAME` in `frontend/sw.js` um eins hochzählen (`schaefchen-online-vNNN`)
- eine **Release-Migration** `database/migrations/NNN_release_version_X_Y_Z.sql`
  mit passendem Test in `database/tests/`. Der Integrationstest „Getrennte
  Plattformverwaltung" vergleicht den Produktionsstand in der Datenbank mit der
  Fassung des Servers und scheitert sonst.
- Einträge in `CHANGELOG.md` und `docs/PROJECT_STATUS.md` inklusive
  `Technischer Stand: VX.Y.Z`

**Veröffentlichte Migrationen werden nie umgeschrieben.** Ist eine
Release-Migration schon in `main`, kommt eine neue Nummer dazu.

## 4. Mehrere Agenten im selben Arbeitsbaum

Arbeiten mehrere Agenten gleichzeitig, gelten zwei Verbote:

- **Kein `git stash`.** Ein Stash nimmt den gesamten Arbeitsbaum mit, also auch
  die halbfertige Arbeit der anderen. Das ist schon passiert; es ging nur
  zufällig gut aus.
- **Keinen Datenbankdienst auf einem belegten Port starten.** Ein Agent hat den
  Standardcluster auf 5432 hochgefahren und damit die eingerichtete Testinstanz
  verdrängt; danach schlug jede Anmeldung fehl. Prüf erst mit `pg_isready`,
  wer horcht, und weich sonst auf einen freien Port aus.

Grenz Aufträge außerdem nach Verzeichnis ab (`api/` und `database/` gegen
`frontend/`) und sag ausdrücklich, wer die Fassung anhebt — sonst tun es zwei.

## 5. Ehrlich berichten

Melde das **echte** Testergebnis, auch wenn es rot ist. Ein beschönigter
Bericht kostet nur eine Runde mehr, und die Prüfung findet es ohnehin.

Wenn dir bei der Arbeit ein Fehler **außerhalb** deines Auftrags auffällt:
melden, nicht stillschweigend mitreparieren und nicht verschweigen. Zwei
solche Funde haben hier echte Fehler aufgedeckt, die sonst liegengeblieben
wären.

Sag auch, wo du unsicher warst. Eine benannte Unsicherheit lässt sich prüfen;
eine verschwiegene wird zur Fehlersuche in zwei Wochen.
