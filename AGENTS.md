# Arbeitsregeln für Schäfchen

## Produktregeln

- Das verbindliche Entwicklungsprinzip lautet: Einfach vor komplex.
- Schäfchen startet als Unternehmenssoftware für Elektrobetriebe. Eine spätere Übertragung des gemeinsamen Kerns auf weitere Gewerke bleibt möglich, erweitert aber nicht den aktuellen Entwicklungsumfang.
- Monteure sollen immer nur den nächsten logischen Schritt und möglichst wenige große Schaltflächen sehen.
- Historie wird erhalten; fachliche Datensätze werden nicht hart gelöscht.
- Jede fachliche Entität ist einem Mandanten zugeordnet. `company_id` wird später serverseitig aus der Sitzung gesetzt und niemals aus ungeprüften Frontend-Daten übernommen.
- Das Frontend darf nicht direkt auf PostgreSQL zugreifen.
- VDE, LWL, DGUV und KNX sind optionale Spezialmodule und gehören nicht zum fachlichen Kern.
- Alle Module verwenden denselben Firmen-, Kunden-, Projekt-, Baustellen- und Dokumentenbestand.

## Entwicklungsphasen

1. Login, Zeiterfassung, Live-Stundenzettel und Wochenplanung
2. Kunden, Projekte, Baustellen, Dokumente und Lieferscheine
3. Aufgaben, Material, Montageberichte, Bautagesberichte und PDF-Versionierung
4. Optionale Spezialmodule wie VDE, LWL, DGUV und KNX
5. KI, Foto-Digitalisierung und Sprache

Neue Funktionen bleiben in ihrer Phase, sofern der Nutzer keine ausdrückliche Änderung beschließt.

## Datenbankregeln

- PostgreSQL verwendet UUIDs, Zeitstempel mit Zeitzone und nachvollziehbare Migrationen.
- Jede fachliche Kerntabelle erhält eine eigene nummerierte Migration.
- Bereits veröffentlichte Migrationen werden nicht umgeschrieben; Änderungen erfolgen in einer neuen Migration.
- Jede Migration muss idempotent ausführbar sein, einen SQL-Test besitzen und in `docs/PROJECT_STATUS.md` sowie `CHANGELOG.md` dokumentiert werden.
- Mandantenfilter und Berechtigungen werden serverseitig erzwungen und automatisiert getestet.

## Prüfung

Vor einem Commit mindestens ausführen:

```bash
docker compose --env-file .env.example config --quiet
make db-test
```

Wenn Docker lokal nicht verfügbar ist, muss die GitHub-Datenbankprüfung erfolgreich sein, bevor der Stand als getestet gilt.
