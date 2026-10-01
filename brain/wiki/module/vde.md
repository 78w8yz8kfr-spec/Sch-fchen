---
typ: modul
stand: 2026-10-01
quellen:
  - README.md
  - docs/ROADMAP_ACCEPTANCE.md
  - AGENTS.md
details_nicht_uebernommen:
  - docs/VDE_MODULE.md
  - docs/ELECTRICAL_MODULES.md
---

# VDE-Prüfmodul

Optionales Spezialmodul für Elektroprüfungen. Technisch ist es vorgezogen
umgesetzt. Nur die Plattform kann es freischalten.

- Mobiler Editor für Verteilungen, FI/RCD-Gruppen und Stromkreise mit
  Messwerten (Zi, Zs, Ik, RCD).
- Kontrollierter Import aus dem Altsystem V15.
- Unterschriebene, unveränderliche Abschluss-PDF.
- Nutzt die Kunden- und Baustellendaten des Kerns → [Referenzprinzip](../konzepte/referenzprinzip.md).
- Tabelle aus Migration 036.
- V0.50 soll die formale Integrationsabnahme bringen.

> **Spannung:** `AGENTS.md` ordnet VDE der Phase 4 zu. Umgesetzt ist es schon
> vor dem Abschluss der Phasen 1–3. Die Fahrplan-Abnahme hält das bewusst fest.
> Siehe [Widersprüche](../analysen/widersprueche.md).

## Verwandt

- [DGUV nach V1.0](../entscheidungen/dguv-nach-v1.md)
- [Plattformverwaltung](plattformverwaltung.md)
