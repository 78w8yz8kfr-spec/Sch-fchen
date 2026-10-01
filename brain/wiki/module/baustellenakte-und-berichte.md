---
typ: modul
stand: 2026-10-01
quellen:
  - docs/ARCHITECTURE.md
  - README.md
details_nicht_uebernommen:
  - docs/SITE_WORK_MODULES.md
  - docs/APPRENTICE_REPORTS.md
---

# Baustellenakte und Berichte

Mobile Arbeitsfläche je Baustelle mit Aufgaben, Material, Notizen, Dokumenten,
Fotos sowie Montage- und Bautagesberichten.

- Tabellen `site_tasks`, `site_material_entries`, `site_reports` (Migrationen 020–022) und `site_notes` (028).
- Berichte haben eine Struktur: Leistungen, Behinderungen, offene Punkte, Mitarbeiterstunden.
- Abschluss mit doppelter Touch-Unterschrift und unveränderlicher PDF.
- Die Berichtszentrale kann Berichte mit Pflichtgrund zurückgeben. Danach
  folgen mobile Überarbeitung und erneute Einreichung.
- Baustellen-QR-Zugriff, Offline-Prioritäten, mobile Dokumentfreigabe (Migration 037).
- Azubi-Wochenberichte als eigene Ausbaustufe (V0.60, Migration 056).

## Verwandt

- [Dokumente](dokumente.md)
- [Fachlicher Kernpfad](../konzepte/fachlicher-kernpfad.md)
