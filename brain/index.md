# Index

Katalog aller Wiki-Seiten. Bei jeder Frage zuerst lesen. Bei jedem Ingest
aktualisieren. Regeln stehen in [SCHEMA.md](SCHEMA.md), der Verlauf in
[log.md](log.md).

**Einstieg:** [Übersicht](wiki/uebersicht.md): Schäfchen auf einer Seite.

## Quellen

| Seite | Kurzinhalt | Rohquelle |
| --- | --- | --- |
| [Produktvision](wiki/quellen/produktvision.md) | Zweck, Grundsätze, Rollen, Modulausbau | `docs/PRODUCT_VISION.md` |
| [Architektur](wiki/quellen/architektur.md) | Komponenten, Mandantenschutz, Datenmodell | `docs/ARCHITECTURE.md` |
| [Arbeitsregeln](wiki/quellen/agents-regeln.md) | Produkt-, Phasen-, DB- und Prüfregeln | `AGENTS.md` |
| [Backlog](wiki/quellen/backlog.md) | Prioritäten, Kategorien, Gates, DoD | `docs/BACKLOG.md` |
| [Fahrplan-Abnahme](wiki/quellen/fahrplan-abnahme.md) | Statusarten, Versionszuordnung, Freigaberegel | `docs/ROADMAP_ACCEPTANCE.md` |
| [Projektstatus](wiki/quellen/projektstatus.md) | V0.44.56, jüngste Änderungen (teilweise übernommen) | `docs/PROJECT_STATUS.md` |

## Konzepte

| Seite | Kurzinhalt |
| --- | --- |
| [Einfach vor komplex](wiki/konzepte/einfach-vor-komplex.md) | Leitprinzip, besonders für die Monteuroberfläche |
| [Mandantentrennung](wiki/konzepte/mandantentrennung.md) | Sitzung, RLS, DB-Rollen, `company_id` |
| [Historie statt Löschen](wiki/konzepte/historie-statt-loeschen.md) | Archivieren, Korrekturen, Sperren |
| [Referenzprinzip](wiki/konzepte/referenzprinzip.md) | Ein Datenbestand, keine Kopien |
| [Fachlicher Kernpfad](wiki/konzepte/fachlicher-kernpfad.md) | Firma → Kunde → Standort → Projekt → Baustelle |
| [Rollen](wiki/konzepte/rollen.md) | Sechs Standardrollen und Systemschlüssel |
| [Offline-Synchronisation](wiki/konzepte/offline-synchronisation.md) | `client_entry_id`, Idempotenz |
| [Definition of Done](wiki/konzepte/definition-of-done.md) | Zehn Punkte und Testfallen |
| [Release-Gates](wiki/konzepte/release-gates.md) | 13 offene Nachweise vor V1.0 |

## Module

| Seite | Kurzinhalt |
| --- | --- |
| [Zeiterfassung und Planung](wiki/module/zeiterfassung-und-planung.md) | Einsätze, Arbeitstage, Stundenkonten, Abwesenheiten |
| [Baustellenakte und Berichte](wiki/module/baustellenakte-und-berichte.md) | Aufgaben, Material, Berichte, Unterschrift, PDF |
| [Dokumente](wiki/module/dokumente.md) | Zentrales Dokumentmodell |
| [VDE-Prüfmodul](wiki/module/vde.md) | Optionales Prüfmodul, V15-Import |
| [Plattformverwaltung](wiki/module/plattformverwaltung.md) | Getrennte Betreiberdomäne, Support, Module |
| [Maschinen und Geräte](wiki/module/geraete.md) | QR-Inventar, Übergaben, Prüfungen |

## Entscheidungen

| Seite | Kurzinhalt |
| --- | --- |
| [DGUV erst nach V1.0](wiki/entscheidungen/dguv-nach-v1.md) | Reihenfolge der Spezialmodule |
| [Frontend nur über API](wiki/entscheidungen/frontend-nur-ueber-api.md) | Kein Direktzugriff auf PostgreSQL |
| [Kein GPS](wiki/entscheidungen/kein-gps.md) | Keine Standortdaten in der Zeiterfassung |
| [Render nur zur Erprobung](wiki/entscheidungen/render-nur-erprobung.md) | Produktionsplattform noch offen |

## Analysen

| Seite | Kurzinhalt |
| --- | --- |
| [Widersprüche und offene Fragen](wiki/analysen/widersprueche.md) | Sechs Befunde aus dem ersten Ingest |

## Noch nicht übernommene Rohquellen

`docs/API_SECURITY.md`, `docs/APPRENTICE_REPORTS.md`, `docs/DATEV_EXPORT.md`,
`docs/DEVICES_MODULE.md`, `docs/DOCUMENT_MODEL.md`, `docs/ELECTRICAL_MODULES.md`,
`docs/HOLIDAY_CALENDAR.md`, `docs/ONLINE_DEPLOYMENT.md`,
`docs/PASSWORT_NOTFALL.md`, `docs/PHASE1_UI_SPEC.md`,
`docs/PLANCRAFT_FEATURE_REVIEW.md`, `docs/PLATFORM_ADMINISTRATION.md`,
`docs/RENDER_GPT_IMPLEMENTATION_PLAN.md`, `docs/SITE_WORK_MODULES.md`,
`docs/SPRINT1_DATA_MODEL.md`, `docs/SPRINT2_TIME_MODEL.md`,
`docs/TIME_ACCOUNTS.md`, `docs/TIME_CORRECTIONS_AND_EMPLOYEE_LIFECYCLE.md`,
`docs/VDE_MODULE.md`, `CHANGELOG.md`, Abschnitt „Abgeschlossen“ in
`docs/PROJECT_STATUS.md`
