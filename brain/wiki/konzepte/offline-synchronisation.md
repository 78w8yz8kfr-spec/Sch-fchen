---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/ARCHITECTURE.md
---

# Offline-Synchronisation

Baustellen haben oft kein Netz. Die PWA puffert Buchungen deshalb und
überträgt sie später. Mehrfache Übertragungen erzeugen keine Dubletten.

- Das Endgerät erzeugt für jeden Eintrag eine `client_entry_id`.
- Kommt dieselbe ID erneut an, liefert die API das vorhandene Ergebnis.
  Wird die ID für einen anderen Inhalt wiederverwendet, lehnt die API ab.
- Jede Client-ID wird in einer eigenen Transaktion synchronisiert.
- Migration 042 dehnt das Prinzip auf alle Zeitbausteine aus: Baustelle,
  Anfang, Ende, Pause, Tätigkeit, Fahrt, Arbeitstag.
- Die öffentliche GitHub-Pages-Demo arbeitet nur mit dem lokalen Browserspeicher.

Reale Offline-Abnahmen auf iPhone und Android sind offene P1-Gates → [Release-Gates](release-gates.md).

## Verwandt

- [Zeiterfassung und Planung](../module/zeiterfassung-und-planung.md)
