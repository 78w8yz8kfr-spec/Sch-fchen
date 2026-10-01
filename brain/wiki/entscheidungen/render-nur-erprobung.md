---
typ: entscheidung
stand: 2026-10-01
quellen:
  - README.md
  - docs/BACKLOG.md
---

# Entscheidung: Render-Blueprint nur zur Erprobung

**Entscheidung:** `render.yaml` stellt Web-App, API und PostgreSQL als
Erprobungsumgebung bereit. Die endgültige Produktionsplattform ist damit nicht
festgelegt.
**Begründung:** Die kostenlose Vorlage hat keinen dauerhaften Speicher und keine
Backups. Vor echten Betriebsdaten braucht es bezahlte Dienste.
**Offen:** Gate #15 Zielplattform → [Release-Gates](../konzepte/release-gates.md).

## Verwandt

- [Projektstatus](../quellen/projektstatus.md)
