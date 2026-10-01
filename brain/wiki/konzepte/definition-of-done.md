---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/BACKLOG.md
  - AGENTS.md
---

# Definition of Done

Eine Produktänderung ist erst fertig, wenn alle zutreffenden Punkte erfüllt sind
(Quelle: `docs/BACKLOG.md`):

1. Ablauf und Fehlerfälle beschrieben
2. Nummerierte, idempotente Migration für Datenänderungen
3. Mandant, Rolle und direkte Objektberechtigung serverseitig geprüft
4. Originale und abgeschlossene Daten nicht hart gelöscht oder unbemerkt überschrieben
5. Versionskonflikte und wiederholte Übertragung berücksichtigt
6. Passende Unit-, SQL-, PostgreSQL-Integrations- und PWA-Smoke-Tests
7. PDFs gerendert und visuell geprüft
8. Dokumentation, Changelog, Versionsanzeige und PWA-Cache-Version konsistent
9. Grüne GitHub-CI für den exakten Commit
10. Reale Abnahmen als belegte Gates, nie simuliert abgehakt

Ergänzend gilt aus `AGENTS.md` und dem Skill `schaefchen-aenderung`:
Integrationstests überspringen sich ohne Datenbank stillschweigend. Ein grüner
Lauf mit `# skipped` ungleich 0 beweist also nichts.

## Verwandt

- [Mandantentrennung](mandantentrennung.md)
- [Historie statt Löschen](historie-statt-loeschen.md)
- [Release-Gates](release-gates.md)
