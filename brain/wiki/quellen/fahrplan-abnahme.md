---
typ: quelle
stand: 2026-10-01
commit: 7221599
quellen:
  - docs/ROADMAP_ACCEPTANCE.md
---

# Quelle: Fahrplan-Abnahme

Gleicht den Fahrplan „V0.35.0 bis V1.0“ mit dem belegbaren Stand ab (geprüfter
Produktstand V0.42.0, Stand 01.08.2026). Ein Punkt gilt nur mit Nachweis als
erledigt. Umsetzung, automatischer Test und reale Abnahme werden getrennt.

## Statusarten

| Status | Bedeutung |
| --- | --- |
| Erfüllt | Implementierung und automatischer Nachweis vorhanden |
| CI-Gate | Muss für den exakten Commit in GitHub Actions grün sein |
| Externe Abnahme | Reale Geräte, Cloud, Menschen oder Zeitraum nötig; nie simuliert abhaken |
| Offen | Nicht umgesetzt oder ohne Nachweis |
| Später | Spätere Etappe |

## Kernaussagen

- Repository-Versionen und Fahrplan-Etappen sind nicht deckungsgleich: V0.36–V0.40 enthielten bereits Abwesenheiten, Stundenkonten, Feiertage und VDE.
- VDE ist technisch vorgezogen; die Reihenfolge ändert sich dadurch nicht → [VDE](../module/vde.md).
- Spätere Etappen: V0.60 Azubi-Modul (erste Stufe gebaut), V0.90 Pilot, V1.0 erst nach allen Gates, DGUV danach → [DGUV nach V1.0](../entscheidungen/dguv-nach-v1.md).
- V0.42.0 ist ein Funktionsstand, keine Produktions- oder V1.0-Freigabe → [Release-Gates](../konzepte/release-gates.md).

## Verwandt

- [Backlog](backlog.md)
- [Projektstatus](projektstatus.md)
