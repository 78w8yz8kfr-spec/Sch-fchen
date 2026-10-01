---
typ: quelle
stand: 2026-10-01
commit: 7221599
quellen:
  - AGENTS.md
---

# Quelle: Arbeitsregeln (AGENTS.md)

Verbindliche Regeln für alle Menschen und Agenten, die am Repository arbeiten.

## Produktregeln

- [Einfach vor komplex](../konzepte/einfach-vor-komplex.md) ist das verbindliche Entwicklungsprinzip.
- Zuerst nur für Elektrobetriebe. Andere Gewerke bleiben später möglich, gehören aber nicht zum aktuellen Umfang.
- Monteure sehen nur den nächsten Schritt und wenige große Schaltflächen.
- [Historie statt Löschen](../konzepte/historie-statt-loeschen.md).
- `company_id` wird serverseitig aus der Sitzung gesetzt → [Mandantentrennung](../konzepte/mandantentrennung.md).
- [Frontend nur über API](../entscheidungen/frontend-nur-ueber-api.md).
- VDE und DGUV sind optionale Spezialmodule.

## Entwicklungsphasen

1. Login, Zeiterfassung, Live-Stundenzettel, Wochenplanung
2. Kunden, Projekte, Baustellen, Dokumente, Lieferscheine
3. Aufgaben, Material, Montageberichte, Bautagesberichte, PDF-Versionierung
4. Optionale Spezialmodule VDE und DGUV
5. KI, Foto-Digitalisierung, Sprache

Neue Funktionen bleiben in ihrer Phase, wenn der Nutzer nichts anderes beschließt.

## Datenbank- und Prüfregeln

- UUIDs, Zeitstempel mit Zeitzone, nummerierte idempotente Migrationen mit SQL-Test.
- Veröffentlichte Migrationen werden nie umgeschrieben.
- Tests bringen eigene Daten mit und laufen wiederholt gegen dieselbe Datenbank.
- Vor jedem Commit: `docker compose --env-file .env.example config --quiet` und `make db-test`.
- CI erzwingt eine Mindestabdeckung für `api/src` (81 % Zeilen, 71 % Zweige, 91 % Funktionen).

Siehe auch [Definition of Done](../konzepte/definition-of-done.md).

## Verwandt

- [Übersicht](../uebersicht.md)
