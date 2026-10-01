---
typ: modul
stand: 2026-10-01
quellen:
  - docs/ARCHITECTURE.md
details_nicht_uebernommen:
  - docs/PLATFORM_ADMINISTRATION.md
---

# Plattformverwaltung

Eine zweite Sicherheitsdomäne, die keinem Mandanten gehört. Hier verwaltet der
Softwarebetreiber Firmenkonten, Tarife, Module und Support.

- `platform_users`, `platform_roles`, `platform_sessions` haben keinen
  Fremdschlüssel auf `companies` (Migrationen 039–041, 044).
- Eigene Datenbankrolle `schaefchen_platform_api`. Sie sieht nur Kataloge und
  zusammengefasste Kontodaten, keine operativen Firmendaten.
- Eigener Pfad `/api/v1/platform/*`, eigenes Cookie, eigene Oberfläche `platform-admin.html`.
- Supportzugriff nur über eine `support_access_session` mit Grund, höchstens
  60 Minuten, protokolliert. Dabei entsteht weder eine Firmenrolle noch ein
  Mitarbeiter.
- Module schaltet nur die Plattform frei (`company_module_entitlements`).
  Eine Firma sieht gesperrte Module höchstens als „auf Anfrage“.

## Verwandt

- [Mandantentrennung](../konzepte/mandantentrennung.md)
- [Rollen](../konzepte/rollen.md)
