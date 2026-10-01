---
typ: konzept
stand: 2026-10-01
quellen:
  - AGENTS.md
  - docs/ARCHITECTURE.md
---

# Mandantentrennung

Jede Firma ist ein Mandant. Ihre Daten sind von allen anderen Firmen streng
getrennt. Die Grenze wird serverseitig in mehreren Schichten erzwungen,
nie im Frontend.

## Schichten

1. **Sitzung:** Die API ermittelt Firma und Benutzer aus der authentifizierten
   Sitzung. IDs von Firma oder Benutzer, die das Frontend mitschickt, werden
   abgewiesen.
2. **Transaktionskontext:** Jede API-Transaktion setzt `app.current_company_id`
   und `app.current_user_id`.
3. **Row Level Security:** Die Rolle `schaefchen_api` ist nicht Eigentümerin der
   Tabellen und bleibt deshalb an RLS gebunden. Nur der getrennte
   Datenbankeigentümer umgeht RLS, und zwar nur für Migrationen und Seeds.
4. **Login-Trennung:** `schaefchen_api_login` hat keine eigenen Tabellenrechte
   und darf nur in die NOLOGIN-Rolle `schaefchen_api` wechseln.
5. **Datenmodell:** `companies` ist die Wurzel. Fachtabellen tragen eine
   Pflicht-`company_id` und zusammengesetzte Fremdschlüssel.

Die gleiche Grenze gilt für Dateiabrufe, Exporte, PDFs, Suchen, Caches und
Hintergrundaufträge. Der Browsercache ist zusätzlich an Benutzer und
App-Version gebunden (Quelle: `docs/ARCHITECTURE.md`, Mandantentrennung).

Ein Mandantenleck ist Priorität P0 und stoppt jedes Release (Quelle: `docs/BACKLOG.md`).

## Verwandt

- [Plattformverwaltung](../module/plattformverwaltung.md): eine zweite Sicherheitsdomäne
- [Frontend nur über API](../entscheidungen/frontend-nur-ueber-api.md)
- [Definition of Done](definition-of-done.md)
