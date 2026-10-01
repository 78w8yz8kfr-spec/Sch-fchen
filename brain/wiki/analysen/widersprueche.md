---
typ: analyse
stand: 2026-10-01
quellen:
  - AGENTS.md
  - docs/ARCHITECTURE.md
  - docs/PROJECT_STATUS.md
  - docs/ROADMAP_ACCEPTANCE.md
---

# Widersprüche und offene Fragen

Gefunden beim ersten Ingest am 01.10.2026. Das Wiki löst keinen Punkt
eigenmächtig auf. Die Entscheidung liegt beim Nutzer, die Korrektur erfolgt in
der Rohquelle.

| # | Befund | Quellen | Status |
| --- | --- | --- | --- |
| 1 | Zwei verschiedene Phasenmodelle: `AGENTS.md` hat 5 Phasen (VDE/DGUV in Phase 4, Lieferscheine in Phase 2). `docs/ARCHITECTURE.md` hat 7 Schritte (getrennter Schritt für Freigabe, Unterschrift und PDF, keine Lieferscheine). Hinzu kommt die Etappenzählung V0.35–V1.0 im Fahrplan. | `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP_ACCEPTANCE.md` | offen |
| 2 | „Nächster Entwicklungsschritt“ verweist noch auf die grüne CI von V0.42.0. Der technische Stand ist V0.44.56. | `docs/PROJECT_STATUS.md` | offen: veraltet? |
| 3 | Der Kopf von `PROJECT_STATUS.md` sagt „Stand: 10.09.2026“, die neuesten Abschnitte sind vom 21.09.2026. | `docs/PROJECT_STATUS.md` | offen: Kleinigkeit |
| 4 | VDE (Phase 4) und Maschinen & Geräte (keiner Phase zugeordnet) sind umgesetzt. `AGENTS.md` verlangt, dass neue Funktionen in ihrer Phase bleiben, außer der Nutzer beschließt ausdrücklich etwas anderes. Ein solcher Beschluss ist im Wiki noch nicht belegt. | `AGENTS.md`, `README.md`, `docs/ROADMAP_ACCEPTANCE.md` | offen: Beschluss nachtragen? |
| 5 | Lieferscheine (`AGENTS.md` Phase 2) sind umgesetzt (Migration `121_create_delivery_notes.sql`, mehrfach im `CHANGELOG.md`), haben aber noch keine Wiki-Seite. Das ist kein Widerspruch, sondern eine Lücke im Wiki. | `AGENTS.md`, `database/migrations/121_create_delivery_notes.sql` | Lücke: beim Ingest von `docs/DOCUMENT_MODEL.md` und `CHANGELOG.md` schließen |
| 6 | Warum kein GPS? Der Grund steht in keiner Quelle. | `docs/ARCHITECTURE.md` | Frage an den Nutzer |

## Verwandt

- [Übersicht](../uebersicht.md)
- [Arbeitsregeln](../quellen/agents-regeln.md)
