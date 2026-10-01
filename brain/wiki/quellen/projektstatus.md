---
typ: quelle
stand: 2026-10-01
commit: 7221599
ingest: teilweise   # gelesen: Kopf, letzte Abschnitte, "Noch zu prüfen", "Nächster Entwicklungsschritt"
quellen:
  - docs/PROJECT_STATUS.md
  - README.md
---

# Quelle: Projektstatus

Laufend fortgeschriebener Umsetzungsstand. Technischer Stand beim Ingest:
**V0.44.56** (Kopf „Stand: 10.09.2026“, jüngster Abschnitt 21.09.2026).
Die letzte Migration im Repository ist `170_release_version_0_44_54.sql`.

## Jüngste Änderungen

- 0.44.56: Datumsformatierer für lokal gespeicherte Berichtsentwürfe repariert.
- 0.44.55: Neues gemeinsames Designsystem (dunkle Navigation, rote Aktionen,
  einheitliche Karten); Abläufe und API unverändert; die mobile Monteuransicht
  behält ihre großen Schaltflächen.
- 0.44.44: Einstufige oder zweistufige Abwesenheitsfreigabe wählbar; Büro kann
  direkt bestätigte Abwesenheiten eintragen (Migrationen 156–157).

## Noch zu prüfen

Reale Geräte-Abnahmen, Lasttest, Zielplattform, Backups/PITR, Härtung,
Datenschutzprüfung, Pilot, Preis- und Lizenzmodell → [Release-Gates](../konzepte/release-gates.md).

## Nächster Entwicklungsschritt (laut Quelle)

V0.50 als formale VDE-Integrationsabnahme, nachdem die V0.42.0-CI grün ist.

> **Widerspruch:** Dieser Abschnitt bezieht sich noch auf V0.42.0, obwohl der
> technische Stand V0.44.56 ist. Siehe [Widersprüche](../analysen/widersprueche.md).

## Noch nicht übernommen

Der lange Abschnitt „Abgeschlossen“ (Zeilen 77–571) ist nicht ausgewertet.
Er sollte beim nächsten Ingest Modul für Modul übernommen werden.

## Verwandt

- [Fahrplan-Abnahme](fahrplan-abnahme.md)
- [Übersicht](../uebersicht.md)
