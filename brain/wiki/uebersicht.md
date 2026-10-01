---
typ: uebersicht
stand: 2026-10-01
quellen:
  - docs/PRODUCT_VISION.md
  - docs/ARCHITECTURE.md
  - docs/PROJECT_STATUS.md
  - docs/BACKLOG.md
  - docs/ROADMAP_ACCEPTANCE.md
  - AGENTS.md
---

# Übersicht: Schäfchen auf einer Seite

**Was:** Schäfchen ist eine modulare, mandantenfähige PWA für Elektrobetriebe.
Ein Datenbestand reicht vom Büro bis zur Baustelle
([Produktvision](quellen/produktvision.md)).

**Wie gebaut:** PWA → Node-API → PostgreSQL mit RLS. Dazu MinIO für Dateien
und n8n für Abläufe ([Architektur](quellen/architektur.md)). Das Frontend
spricht nie direkt mit der Datenbank
([Entscheidung](entscheidungen/frontend-nur-ueber-api.md)).

**Leitprinzipien:**
[Einfach vor komplex](konzepte/einfach-vor-komplex.md) ·
[Mandantentrennung](konzepte/mandantentrennung.md) ·
[Historie statt Löschen](konzepte/historie-statt-loeschen.md) ·
[Referenzprinzip](konzepte/referenzprinzip.md)

**Datenrückgrat:** [Firma → Kunde → Standort → Projekt → Baustelle](konzepte/fachlicher-kernpfad.md).

**Stand (V0.44.56, September 2026):** Umgesetzt sind
[Zeiterfassung und Planung](module/zeiterfassung-und-planung.md),
[Baustellenakte und Berichte](module/baustellenakte-und-berichte.md),
[Dokumente](module/dokumente.md), [VDE](module/vde.md),
[Maschinen und Geräte](module/geraete.md),
[Plattformverwaltung](module/plattformverwaltung.md) und erste Azubi-Berichte.

**Was V1.0 noch fehlt:** Funktionen fehlen kaum. Es fehlen reale Nachweise:
Geräteabnahmen, Lasttest, Zielplattform, Backups, Härtung, Datenschutz und ein
vierwöchiger Pilot ([Release-Gates](konzepte/release-gates.md)).

**These:** Schäfchen ist funktional weiter als seine Abnahmen. Der Engpass auf
dem Weg zu V1.0 ist Betrieb und Nachweis, nicht neuer Code. Diese These
sollte beim Ingest der GitHub-Issues #11–#23 überprüft werden.

**Spannungen:** [Widersprüche und offene Fragen](analysen/widersprueche.md).
