---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/PRODUCT_VISION.md
  - docs/ARCHITECTURE.md
---

# Rollen

Es gibt sechs sichtbare Standardrollen je Firma, dazu getrennte Plattformrollen.

| Rolle | Systemschlüssel | Schwerpunkt |
| --- | --- | --- |
| Geschäftsführer | `managing_director` | Betriebliche Gesamtsteuerung |
| Administrator | `admin` | Technischer Vollzugriff |
| Büro / Disposition | `dispatch_office` | Kunden-, Baustellen-, Einsatzplanung |
| Projektleiter | `project_manager` | Zugewiesene Projekte und Baustellen |
| Vorarbeiter | `foreman` | Erweiterte Arbeit auf zugewiesenen Baustellen |
| Monteur | `installer` | Eigener Live-Arbeitstag |

- Alte Schlüssel `office`, `planner` und `executive_assistant` bleiben für
  bestehende Konten gültig, werden aber nicht mehr vergeben.
- `user_roles` erlaubt mehrere Rollen je Benutzer, historisiert.
- Plattformrollen sind getrennt und haben keine Firmenmitgliedschaft → [Plattformverwaltung](../module/plattformverwaltung.md).
- Mit Migration 058 kam eine Azubi-Rolle dazu. Sie ist noch nicht im Detail
  übernommen (Quelle: Dateiname `058_apprentice_role_and_privacy.sql`).

## Verwandt

- [Einfach vor komplex](einfach-vor-komplex.md)
