---
typ: entscheidung
stand: 2026-10-01
quellen:
  - AGENTS.md
  - docs/ARCHITECTURE.md
---

# Entscheidung: Frontend nur über die API

**Entscheidung:** Die PWA greift nie direkt auf PostgreSQL zu. Alle Daten laufen
über die Node-API.
**Begründung:** Nur so lassen sich Mandantentrennung, Rollen und Fachregeln
zentral und serverseitig erzwingen.
**Folge:** `company_id` und `user_id` kommen immer aus der Sitzung, nie aus
Frontend-Daten.

## Verwandt

- [Mandantentrennung](../konzepte/mandantentrennung.md)
