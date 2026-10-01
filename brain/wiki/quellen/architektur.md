---
typ: quelle
stand: 2026-10-01
commit: 7221599
quellen:
  - docs/ARCHITECTURE.md
---

# Quelle: Architektur

Technisches Zielbild (Stand 01.08.2026): eine mandantenfähige PWA für Handy
und PC, die ausschließlich über eine Node-API mit PostgreSQL spricht.

## Komponenten

| Komponente | Aufgabe |
| --- | --- |
| Firmen-PWA | Bedienoberfläche für Monteure, Vorarbeiter und Firmenrollen |
| Plattform-PWA | Getrennte Oberfläche für Plattformrollen |
| API | Authentifizierung, Berechtigungen, Fachlogik, Mandantenschutz |
| PostgreSQL | Geschäfts-, Zeit-, Berichts- und VDE-Daten |
| MinIO | S3-Ablage für Fotos, Logos, Unterschriften, PDF-Versionen |
| n8n | Benachrichtigungen, PDFs, Dokumentenverarbeitung, spätere KI |
| pgAdmin | Nur lokale Entwicklung |

## Kernaussagen

- Kernpfad mit Kundenstandort: Firma → Kunde → Kundenstandort → Projekt → Baustelle → [Fachlicher Kernpfad](../konzepte/fachlicher-kernpfad.md).
- Mandantenschutz in drei Schichten: Sitzung, Row Level Security, eingeschränkte Datenbankrollen → [Mandantentrennung](../konzepte/mandantentrennung.md).
- Plattformverwaltung ist eine zweite, nicht mandantenbezogene Sicherheitsdomäne (Migrationen 039–041) → [Plattformverwaltung](../module/plattformverwaltung.md).
- Dokumente: `documents`, `document_contents` (max. 5 MB, Austauschgrenze zu MinIO), `document_links` (Migration 017) → [Dokumente](../module/dokumente.md).
- Datenhistorie: deaktivieren/archivieren statt löschen; `row_version` und Sperren gegen verlorene Änderungen → [Historie statt Löschen](../konzepte/historie-statt-loeschen.md).
- Zeiterfassung ereignisbasiert mit `client_entry_id` für idempotente Offline-Übertragung → [Zeiterfassung und Planung](../module/zeiterfassung-und-planung.md), [Offline-Synchronisation](../konzepte/offline-synchronisation.md).
- Sitzungen: nur SHA-256-Hash in der Datenbank, rohes Token im `HttpOnly`-Cookie, Passwörter mit `scrypt` (Migration 013).

> **Widerspruch:** Die Entwicklungsreihenfolge hat hier sieben Schritte, in
> `AGENTS.md` fünf Phasen. Siehe [Widersprüche](../analysen/widersprueche.md).

## Verwandt

- [Produktvision](produktvision.md)
- [Frontend nur über API](../entscheidungen/frontend-nur-ueber-api.md)
