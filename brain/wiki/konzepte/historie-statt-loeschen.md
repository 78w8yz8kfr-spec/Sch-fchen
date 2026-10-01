---
typ: konzept
stand: 2026-10-01
quellen:
  - AGENTS.md
  - docs/ARCHITECTURE.md
---

# Historie statt Löschen

Fachliche Datensätze werden deaktiviert oder archiviert. Hart gelöscht wird
nicht. Korrekturen entstehen als neue, referenzierende Einträge.

- Einzige Ausnahme: Ein technisch neuer Mitarbeiter ohne jede historische
  Referenz darf nach einer Sicherheitsabfrage hart gelöscht werden (Migration 043).
- Zeitkorrekturen sind neue Einträge. Bei freigegebenen oder abgerechneten Tagen
  müssen sie getrennt genehmigt werden. Original und Audit bleiben erhalten.
- Umplanungen erzeugen einen Vorher-Stand in `site_assignment_history`.
- Rollenzuweisungen werden mit Zuweisungs- und Widerrufszeitpunkt historisiert.
- Abschluss-PDFs sind unveränderliche Versionen.
- `row_version`, erwartete Änderungszeitpunkte und transaktionale Sperren
  verhindern, dass gleichzeitige Änderungen verloren gehen.

(Quelle: `docs/ARCHITECTURE.md`, Datenhistorie und Sprint 2)

## Verwandt

- [Zeiterfassung und Planung](../module/zeiterfassung-und-planung.md)
- [Definition of Done](definition-of-done.md)
