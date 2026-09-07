import assert from "node:assert/strict";
import test from "node:test";
import {
  describeChange,
  groupTimeChangesByWorkDate,
  operationDisplayStatus
} from "../core/time-changes.js";

test("Nur 'applied' oder 'approved' gelten als wirksam, alles andere ist Antrag", () => {
  // Das ist die zentrale Unterscheidung der Anzeige: ein Antrag hat die
  // gebuchte Zeit noch nicht verändert.
  assert.equal(operationDisplayStatus({ status: "pending", effective: false }), "pending");
  assert.equal(operationDisplayStatus({ status: "applied", effective: true }), "effective");
  assert.equal(operationDisplayStatus({ status: "approved", effective: true }), "effective");
  // Abgelehnt bleibt sichtbar (Historie wird erhalten), ist aber nie wirksam -
  // auch nicht, wenn das effective-Feld aus welchem Grund auch immer falsch
  // gesetzt wäre.
  assert.equal(operationDisplayStatus({ status: "rejected", effective: false }), "rejected");
  assert.equal(operationDisplayStatus({ status: "rejected", effective: true }), "rejected");
});

test("Nur tatsächlich unterschiedliche Felder werden als Änderung gemeldet", () => {
  const gleicheBaustelle = describeChange({
    workDate: "2026-09-01",
    oldValue: { workDayId: "a", recordedAt: "2026-09-01T07:00:00Z", constructionSiteId: "site-1", activityNote: null, travelMinutes: 15 },
    newValue: { workDayId: "a", recordedAt: "2026-09-01T07:30:00Z", constructionSiteId: "site-1", activityNote: null, travelMinutes: 15 }
  });
  // Nur die Uhrzeit hat sich geändert - nicht "Baustelle: site-1 -> site-1".
  assert.deepEqual(gleicheBaustelle.fields, [
    { field: "recordedAt", from: "2026-09-01T07:00:00Z", to: "2026-09-01T07:30:00Z" }
  ]);
  assert.equal(gleicheBaustelle.added, false);
  assert.equal(gleicheBaustelle.deleted, false);
  assert.equal(gleicheBaustelle.movedTo, null);
});

test("Aufgelöste Baustellennamen werden ins constructionSite-Feld durchgereicht", () => {
  // Normalfall: der Zugang konnte beide Kennungen auflösen. Die Namen stehen
  // auf Höhe der Änderung (siehe api/src/app.mjs timeChangeItemViewDto), nicht
  // in oldValue/newValue - describeChange muss sie von dort holen.
  const beideNamenBekannt = describeChange({
    workDate: "2026-09-01",
    oldValue: { constructionSiteId: "site-1" },
    newValue: { constructionSiteId: "site-2" },
    oldConstructionSiteName: "Hauptwerk",
    newConstructionSiteName: "Müllerstraße 12"
  });
  assert.deepEqual(beideNamenBekannt.fields, [
    { field: "constructionSite", from: "site-1", to: "site-2", fromName: "Hauptwerk", toName: "Müllerstraße 12" }
  ]);
});

test("Ein nicht auflösbarer oder fehlender Baustellenname wird als null durchgereicht, nie geraten", () => {
  // Nur die neue Kennung war auflösbar - die alte war entweder gar keine
  // Baustelle oder ausnahmsweise nicht auflösbar. Beides sieht hier gleich
  // aus (null), wie von der API vorgegeben - describeChange erfindet nichts.
  const nurNeuerNameBekannt = describeChange({
    workDate: "2026-09-01",
    oldValue: { constructionSiteId: "site-1" },
    newValue: { constructionSiteId: "site-2" },
    oldConstructionSiteName: null,
    newConstructionSiteName: "Müllerstraße 12"
  });
  assert.deepEqual(nurNeuerNameBekannt.fields, [
    { field: "constructionSite", from: "site-1", to: "site-2", fromName: null, toName: "Müllerstraße 12" }
  ]);

  const nurAlterNameBekannt = describeChange({
    workDate: "2026-09-01",
    oldValue: { constructionSiteId: "site-1" },
    newValue: { constructionSiteId: "site-2" },
    oldConstructionSiteName: "Hauptwerk",
    newConstructionSiteName: null
  });
  assert.deepEqual(nurAlterNameBekannt.fields, [
    { field: "constructionSite", from: "site-1", to: "site-2", fromName: "Hauptwerk", toName: null }
  ]);
});

test("Fehlen beide Baustellennamen, bleiben from/toName null statt eines Platzhalters", () => {
  // Weder Server noch describeChange dürfen hier einen Namen erfinden - die
  // Oberfläche entscheidet selbst, wie sie den fehlenden Namen darstellt
  // (siehe timeChangeFieldSentence in app.js, Rückfall "Andere Baustelle").
  const keinNameBekannt = describeChange({
    workDate: "2026-09-01",
    oldValue: { constructionSiteId: "site-1" },
    newValue: { constructionSiteId: "site-2" }
    // oldConstructionSiteName/newConstructionSiteName fehlen ganz - wie bei
    // einer älteren Serverantwort oder wenn beide Kennungen unauflösbar sind.
  });
  assert.deepEqual(keinNameBekannt.fields, [
    { field: "constructionSite", from: "site-1", to: "site-2", fromName: null, toName: null }
  ]);
});

test("Eine leere Notiz und keine Notiz gelten als derselbe Zustand", () => {
  const unveraendert = describeChange({
    workDate: "2026-09-01",
    oldValue: { activityNote: null, recordedAt: "x", constructionSiteId: "s", travelMinutes: 0 },
    newValue: { activityNote: "", recordedAt: "x", constructionSiteId: "s", travelMinutes: 0 }
  });
  assert.deepEqual(unveraendert.fields, []);

  const echteNotiz = describeChange({
    workDate: "2026-09-01",
    oldValue: { activityNote: null, recordedAt: "x", constructionSiteId: "s", travelMinutes: 0 },
    newValue: { activityNote: "Sicherung getauscht", recordedAt: "x", constructionSiteId: "s", travelMinutes: 0 }
  });
  assert.deepEqual(echteNotiz.fields, [
    { field: "activityNote", from: null, to: "Sicherung getauscht" }
  ]);
});

test("Eine Verschiebung auf denselben Tag zählt nicht als Verschiebung", () => {
  assert.equal(
    describeChange({ workDate: "2026-09-01", movedToWorkDate: "2026-09-01" }).movedTo,
    null
  );
  assert.equal(
    describeChange({ workDate: "2026-09-01", movedToWorkDate: "2026-09-03" }).movedTo,
    "2026-09-03"
  );
});

test("Gelöschte und ergänzte Buchungen vergleichen keine Einzelfelder", () => {
  const geloescht = describeChange({
    workDate: "2026-09-01",
    oldValue: { recordedAt: "2026-09-01T07:00:00Z" },
    newValue: null
  });
  assert.equal(geloescht.deleted, true);
  assert.equal(geloescht.added, false);
  assert.deepEqual(geloescht.fields, []);

  const ergaenzt = describeChange({
    workDate: "2026-09-01",
    oldValue: null,
    newValue: { recordedAt: "2026-09-01T07:00:00Z" }
  });
  assert.equal(ergaenzt.added, true);
  assert.equal(ergaenzt.deleted, false);
  assert.deepEqual(ergaenzt.fields, []);
});

test("Änderungen werden nach betroffenem Arbeitstag gruppiert", () => {
  const operations = [
    {
      id: "op-1",
      status: "applied",
      effective: true,
      changes: [
        { workDate: "2026-09-01", oldValue: { recordedAt: "a" }, newValue: { recordedAt: "b" } },
        { workDate: "2026-09-02", oldValue: { recordedAt: "c" }, newValue: { recordedAt: "d" } }
      ]
    },
    {
      id: "op-2",
      status: "pending",
      effective: false,
      changes: [
        { workDate: "2026-09-01", oldValue: { recordedAt: "e" }, newValue: { recordedAt: "f" } }
      ]
    },
    {
      // Eine Änderung ohne Tagesbezug kann keine Tageskarte anzeigen und
      // darf die Gruppierung nicht unter einem falschen Schlüssel verstopfen.
      id: "op-3",
      status: "applied",
      effective: true,
      changes: [{ workDate: null, oldValue: {}, newValue: {} }]
    }
  ];

  const groups = groupTimeChangesByWorkDate(operations);
  assert.equal(groups.size, 2);
  assert.equal(groups.get("2026-09-01").length, 2);
  assert.equal(groups.get("2026-09-01")[0].operation.id, "op-1");
  assert.equal(groups.get("2026-09-01")[1].operation.id, "op-2");
  assert.equal(groups.get("2026-09-02").length, 1);
  assert.equal(groups.get("2026-09-02")[0].change.fields[0].to, "d");
});

test("Änderungen und fehlende Vorgänge führen nicht zum Absturz", () => {
  assert.equal(groupTimeChangesByWorkDate(null).size, 0);
  assert.equal(groupTimeChangesByWorkDate([]).size, 0);
  assert.equal(groupTimeChangesByWorkDate([{ id: "leer" }]).size, 0);
});
