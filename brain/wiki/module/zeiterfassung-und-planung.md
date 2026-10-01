---
typ: modul
stand: 2026-10-01
quellen:
  - docs/ARCHITECTURE.md
  - README.md
details_nicht_uebernommen:
  - docs/SPRINT2_TIME_MODEL.md
  - docs/TIME_ACCOUNTS.md
  - docs/TIME_CORRECTIONS_AND_EMPLOYEE_LIFECYCLE.md
  - docs/HOLIDAY_CALENDAR.md
---

# Zeiterfassung und Planung

Herzstück der Phase 1: Live-Arbeitstag der Monteure, Wochenplanung durch das
Büro, Stundenkonten und Abwesenheiten.

## Datenmodell

- `site_assignments`: Mitarbeiter × Tag × Baustelle mit Pflicht-Reihenfolge.
  Freigegebene Umplanungen schreiben `site_assignment_history`.
- `site_supervisors`: mehrere Vorarbeiter. Ein neuer Hauptvorarbeiter löst den
  bisherigen ab und übernimmt die Berichtsverantwortung. Ist nur ein Mitarbeiter
  auf der Baustelle, wird er automatisch Vorarbeiter (Migration 026).
- `work_days`: berechneter Tagesstand mit am Tag eingefrorenem Soll.
- `time_entries`: unveränderliche Ereignisse → [Offline-Synchronisation](../konzepte/offline-synchronisation.md).
- Regelversion 4 berechnet Quell- und Zieltag einer Korrektur atomar neu.
- Es wird kein GPS gespeichert → [Kein GPS](../entscheidungen/kein-gps.md).

## Funktionen (laut README)

Desktop-Plantafel mit Woche und Monat, Drag-and-drop, Planungsteams,
Konfliktanzeige. Excel-Import von Wochenplan und Baustellenliste mit Vorschau.
Abwesenheitsanträge mit ein- oder zweistufiger Freigabe. Stundenkonto,
Urlaubsanspruch, Feiertagskalender aller 16 Bundesländer, Tageslage für die
Disposition.

## Verwandt

- [Historie statt Löschen](../konzepte/historie-statt-loeschen.md)
- [Rollen](../konzepte/rollen.md)
