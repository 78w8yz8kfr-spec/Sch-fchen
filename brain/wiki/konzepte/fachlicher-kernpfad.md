---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/PRODUCT_VISION.md
  - docs/ARCHITECTURE.md
---

# Fachlicher Kernpfad

Das Rückgrat des Datenmodells. Alle Fachmodule hängen an Projekt und Baustelle.

`companies → customers → customer_locations → projects → construction_sites`

- Ein Projekt gehört zu genau einem Kunden. Über `project_locations` kann es
  mehrere Standorte dieses Kunden haben.
- `project_responsibles` hält mehrere historisierte Verantwortliche.
- Eine Baustelle gehört genau zu einem Projekt und kann optional einen
  Kundenstandort verwenden.
- Die Verwaltung legt den Pfad in drei getrennten Schritten an: Kunde, Projekt,
  Baustelle. Der alte Paket-Endpunkt dient nur noch Importen.
- Migrationen 004–008 (Quelle: `docs/ARCHITECTURE.md`, Sprint 1).

> Die Produktvision nennt den Pfad ohne Kundenstandort. Die Architektur ist
> genauer. Kein echter Widerspruch.

## Verwandt

- [Referenzprinzip](referenzprinzip.md)
- [Mandantentrennung](mandantentrennung.md)
