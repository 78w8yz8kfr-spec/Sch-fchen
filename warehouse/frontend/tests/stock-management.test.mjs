import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHRITTE,
  VORGAENGE,
  lagerZustand,
  mengeAusText,
  mengeAlsText,
  scanVerarbeiten,
  verfuegbareVorgaenge,
  darfVorgang,
  buchungBauen,
  neueVorgangId,
  buchungVerarbeiten,
  bestandLage,
  bestandText,
  ortKurz,
  knappeArtikel,
  artikelEntwurfAusScan,
  offlineLagerQueueKey,
  ansichtFuer,
  startAnsicht,
  buchenAnsicht,
  bestandNachOrt,
  deckungsgrad,
  nachbestellungZeilen,
  bestandsmengeAusText,
  artikelFormularLesen,
  bestandAnsicht,
  artikelListeAnsicht,
  nachbestellungAnsicht,
  artikelFormularAnsicht,
  zaehlmengeAusText,
  inventurFortschritt,
  differenzText,
  differenzLage,
  inventurScanVerarbeiten,
  zaehlungBauen,
  inventurAnsicht,
  BESTELLSTATUS,
  bestellStatusText,
  bestellungFortschritt,
  wareneingangBauen,
  eingangVorbelegen,
  bestellungenAnsicht,
  bestellungAnsicht
} from '../stock-management.js';

const REGAL = { id: 'ort-1', name: 'Fach A1', path: 'Materiallager › Regal A › Fach A1' };
const LAGER = { id: 'ort-0', name: 'Materiallager', path: 'Materiallager' };
const ARTIKEL = {
  id: 'art-1',
  itemNumber: 'LAG-0001',
  name: 'Schalterdose tief',
  unit: 'Stück',
  minimumStock: 50
};

test('eine mit Komma getippte Menge ist eine Menge', () => {
  assert.equal(mengeAusText('3,5'), 3.5);
  assert.equal(mengeAusText('3.5'), 3.5);
  assert.equal(mengeAusText(' 12 '), 12);
  assert.equal(mengeAusText('0,25'), 0.25);
  assert.equal(mengeAusText(7), 7);
});

test('was keine Menge ist, wird nicht stillschweigend zu null', () => {
  for (const eingabe of ['', '   ', '0', '-3', 'abc', '1,2,3', '.', null, undefined, {}, NaN]) {
    assert.equal(mengeAusText(eingabe), null, `${JSON.stringify(eingabe)} wurde als Menge akzeptiert`);
  }
});

test('Mengen werden mit Komma angezeigt', () => {
  assert.equal(mengeAlsText(3.5), '3,5');
  assert.equal(mengeAlsText(12), '12');
  assert.equal(mengeAlsText(0.125), '0,125');
});

test('ein gescannter Lagerplatz bleibt gesetzt', () => {
  const zustand = scanVerarbeiten(lagerZustand(), {
    found: true, kind: 'location', location: REGAL
  });

  assert.equal(zustand.ort.id, REGAL.id);
  assert.equal(zustand.schritt, SCHRITTE.START);
  assert.match(zustand.hinweis, /Fach A1/);
});

test('der Kartoncode bucht das Gebinde, nicht ein Stück', () => {
  const mitOrt = scanVerarbeiten(lagerZustand(), { found: true, kind: 'location', location: REGAL });

  const einzeln = scanVerarbeiten(mitOrt, {
    found: true, kind: 'item', packQuantity: 1, item: ARTIKEL, levels: []
  });
  assert.equal(einzeln.menge, '1');
  assert.equal(einzeln.gebinde, 1);

  const karton = scanVerarbeiten(mitOrt, {
    found: true, kind: 'item', packQuantity: 100, item: ARTIKEL, levels: []
  });
  assert.equal(karton.menge, '100');
  assert.equal(karton.gebinde, 100);
  assert.equal(karton.schritt, SCHRITTE.BUCHEN);
});

test('der Bestand am gemerkten Ort wird herausgesucht', () => {
  const mitOrt = scanVerarbeiten(lagerZustand(), { found: true, kind: 'location', location: REGAL });
  const zustand = scanVerarbeiten(mitOrt, {
    found: true,
    kind: 'item',
    packQuantity: 1,
    item: ARTIKEL,
    levels: [
      { locationId: 'ort-0', quantity: 500 },
      { locationId: REGAL.id, quantity: 42 }
    ]
  });

  assert.equal(zustand.bestandAmOrt, 42, 'Es zählt der Bestand hier, nicht der im Hauptlager');
});

test('ein unbekannter Code führt zur Neuanlage statt in eine Sackgasse', () => {
  const zustand = scanVerarbeiten(lagerZustand(), {
    found: false, kind: 'gtin', code: '5901234123457', normalized: '05901234123457'
  });

  assert.equal(zustand.schritt, SCHRITTE.UNBEKANNT);
  assert.equal(zustand.letzterScan.wert, '05901234123457');
  assert.equal(zustand.letzterScan.roh, '5901234123457');
});

test('wer was darf, entscheidet die Rolle', () => {
  const monteur = verfuegbareVorgaenge({}).map((v) => v.schluessel);
  assert.deepEqual(monteur, ['entnahme', 'rueckgabe']);

  const vorarbeiter = verfuegbareVorgaenge({ transfer: true }).map((v) => v.schluessel);
  assert.deepEqual(vorarbeiter, ['entnahme', 'rueckgabe', 'umlagerung']);

  const buero = verfuegbareVorgaenge({ transfer: true, manage: true }).map((v) => v.schluessel);
  assert.deepEqual(buero, Object.keys(VORGAENGE));

  assert.equal(darfVorgang({}, 'umlagerung'), false);
  assert.equal(darfVorgang({ transfer: true }, 'wareneingang'), false);
  assert.equal(darfVorgang({ manage: true, transfer: true }, 'verschrottung'), true);
});

function buchbarerZustand(zusatz = {}) {
  return lagerZustand({
    ort: REGAL,
    artikel: ARTIKEL,
    menge: '5',
    schritt: SCHRITTE.BUCHEN,
    ...zusatz
  });
}

test('eine Entnahme bucht vom gemerkten Ort weg', () => {
  const { buchung, fehler } = buchungBauen(buchbarerZustand(), { vorgangId: 'op-1' });

  assert.equal(fehler, undefined);
  assert.deepEqual(buchung, {
    itemId: 'art-1',
    movementType: 'issue',
    quantity: 5,
    sourceType: 'qr_scan',
    clientOperationId: 'op-1',
    sourceLocationId: REGAL.id
  });
});

test('eine Rückgabe bucht auf den Ort hin', () => {
  const { buchung } = buchungBauen(buchbarerZustand({ vorgang: 'rueckgabe' }), { vorgangId: 'op-2' });
  assert.equal(buchung.movementType, 'return');
  assert.equal(buchung.targetLocationId, REGAL.id);
  assert.equal(buchung.sourceLocationId, undefined);
});

test('eine Umlagerung braucht einen anderen Zielort', () => {
  const ohneZiel = buchungBauen(buchbarerZustand({ vorgang: 'umlagerung' }), {});
  assert.match(ohneZiel.fehler, /Zielort/);

  const aufSichSelbst = buchungBauen(
    buchbarerZustand({ vorgang: 'umlagerung', zielOrtId: REGAL.id }), {}
  );
  assert.match(aufSichSelbst.fehler, /verschieden/);

  const richtig = buchungBauen(
    buchbarerZustand({ vorgang: 'umlagerung', zielOrtId: LAGER.id }), { vorgangId: 'op-3' }
  );
  assert.equal(richtig.buchung.sourceLocationId, REGAL.id);
  assert.equal(richtig.buchung.targetLocationId, LAGER.id);
});

test('ohne Lagerplatz und ohne Menge wird nicht gebucht', () => {
  assert.match(buchungBauen(buchbarerZustand({ ort: null }), {}).fehler, /Lagerplatz/);
  assert.match(buchungBauen(buchbarerZustand({ menge: '' }), {}).fehler, /Menge/);
  assert.match(buchungBauen(buchbarerZustand({ menge: '0' }), {}).fehler, /Menge/);
  assert.match(buchungBauen(buchbarerZustand({ artikel: null }), {}).fehler, /Artikel/);
});

test('die Firmenregel zur Baustelle wird vor dem Absenden geprüft', () => {
  const ohne = buchungBauen(buchbarerZustand(), { baustellePflicht: true });
  assert.match(ohne.fehler, /Baustelle/);

  const mit = buchungBauen(
    buchbarerZustand({ baustelleId: 'bau-1' }), { baustellePflicht: true, vorgangId: 'op-4' }
  );
  assert.equal(mit.buchung.constructionSiteId, 'bau-1');

  // Eine Baustelle bei einer Rückgabe wäre sinnlos und wird nicht mitgeschickt.
  const rueckgabe = buchungBauen(
    buchbarerZustand({ vorgang: 'rueckgabe', baustelleId: 'bau-1' }), { vorgangId: 'op-5' }
  );
  assert.equal(rueckgabe.buchung.constructionSiteId, undefined);
});

test('jede Buchung bekommt eine eigene, wiederverwendbare Vorgangsnummer', () => {
  const erste = buchungBauen(buchbarerZustand(), {}).buchung.clientOperationId;
  const zweite = buchungBauen(buchbarerZustand(), {}).buchung.clientOperationId;

  assert.notEqual(erste, zweite, 'Zwei Buchungen dürfen nicht dieselbe Nummer tragen');
  assert.match(erste, /^stock-/);

  // Dieselbe Nummer erneut mitgeben heißt: derselbe Vorgang, zweiter Versuch.
  const wiederholt = buchungBauen(buchbarerZustand(), { vorgangId: erste }).buchung;
  assert.equal(wiederholt.clientOperationId, erste);

  const viele = new Set(Array.from({ length: 200 }, () => neueVorgangId()));
  assert.equal(viele.size, 200);
});

test('nach dem Buchen bleibt der Ort stehen und der Artikel geht weg', () => {
  const vorher = buchbarerZustand();
  const nachher = buchungVerarbeiten(vorher, {
    repeated: false,
    levels: [{ locationId: REGAL.id, quantity: 37 }]
  });

  assert.equal(nachher.schritt, SCHRITTE.BESTAETIGT);
  assert.equal(nachher.ort.id, REGAL.id, 'Der Lagerplatz muss für den nächsten Scan stehen bleiben');
  assert.equal(nachher.artikel, null);
  assert.equal(nachher.bestaetigung.neuerBestand, 37);
  assert.equal(nachher.bestaetigung.menge, 5);
  assert.equal(nachher.bestaetigung.vorgang, 'Entnehmen');
  assert.equal(nachher.bestaetigung.wiederholt, false);
});

test('eine bereits gezählte Buchung wird als solche benannt', () => {
  const nachher = buchungVerarbeiten(buchbarerZustand(), { repeated: true, levels: [] });
  assert.equal(nachher.bestaetigung.wiederholt, true);
  assert.equal(nachher.bestaetigung.neuerBestand, null);
});

test('ein negativer Bestand gilt als unplausibel und nicht als leer', () => {
  assert.equal(bestandLage(-3), 'unplausibel');
  assert.equal(bestandLage(0), 'leer');
  assert.equal(bestandLage(10, 50), 'knapp');
  assert.equal(bestandLage(80, 50), 'gut');
  assert.equal(bestandLage(null), 'unbekannt');
  assert.equal(bestandText(3.5, 'Meter'), '3,5 Meter');
  assert.equal(bestandText(null), 'unbekannt');
});

test('ein langer Lagerpfad wird für das Telefon gekürzt', () => {
  assert.equal(ortKurz(REGAL), '… › Regal A › Fach A1');
  assert.equal(ortKurz(LAGER), 'Materiallager');
  assert.equal(ortKurz({ name: 'Werkstatt' }), 'Werkstatt');
  assert.equal(ortKurz(null), null);
});

test('knappe Artikel sind die unter ihrem Mindestbestand', () => {
  const knapp = knappeArtikel([
    { id: 'a', minimumStock: 50, totalQuantity: 20 },
    { id: 'b', minimumStock: 50, totalQuantity: 80 },
    { id: 'c', minimumStock: 0, totalQuantity: 0 },
    { id: 'd', minimumStock: 10, totalQuantity: -5 }
  ]);
  assert.deepEqual(knapp.map((e) => e.id), ['a', 'd']);
});

test('aus einem unbekannten Code entsteht ein Artikelentwurf mit dem Code', () => {
  const entwurf = artikelEntwurfAusScan(
    { art: 'gtin', wert: '05901234123457', roh: '5901234123457' },
    [{ key: 'installation' }]
  );

  assert.equal(entwurf.groupKey, 'installation');
  assert.deepEqual(entwurf.barcodes, [{
    code: '5901234123457', codeType: 'gtin', packQuantity: 1, isPrimary: true
  }]);

  const freitext = artikelEntwurfAusScan({ art: 'text', wert: 'KABEL-99', roh: 'kabel-99' }, []);
  assert.equal(freitext.barcodes[0].codeType, 'internal');
  assert.equal(freitext.groupKey, 'other');
});

test('der Offline-Schlüssel trennt Firma und Benutzer', () => {
  const a = offlineLagerQueueKey({ company: { number: 'F-000001' }, user: { id: 'u1' } });
  const b = offlineLagerQueueKey({ company: { number: 'F-000002' }, user: { id: 'u1' } });
  const c = offlineLagerQueueKey({ company: { number: 'F-000001' }, user: { id: 'u2' } });

  assert.equal(new Set([a, b, c]).size, 3);
  assert.match(offlineLagerQueueKey(null), /unknown:unknown$/);
});

test('die Ansicht zeigt dem Monteur nur seine Schaltflächen', () => {
  const zustand = buchbarerZustand();

  const monteur = ansichtFuer(zustand, {}, {});
  assert.ok(monteur.includes('data-vorgang="entnahme"'));
  assert.ok(monteur.includes('data-vorgang="rueckgabe"'));
  assert.ok(!monteur.includes('data-vorgang="umlagerung"'));
  assert.ok(!monteur.includes('data-vorgang="verschrottung"'));

  const buero = ansichtFuer(zustand, { manage: true, transfer: true }, {});
  assert.ok(buero.includes('data-vorgang="umlagerung"'));
  assert.ok(buero.includes('data-vorgang="verschrottung"'));
});

test('die Startansicht zeigt Verwaltungskacheln nur der Verwaltung', () => {
  const monteur = startAnsicht(lagerZustand(), {});
  assert.ok(monteur.includes('data-ziel="bestand"'));
  assert.ok(!monteur.includes('data-ziel="artikel"'));
  assert.ok(monteur.includes('Lagerplatz scannen'));

  const buero = startAnsicht(lagerZustand({ ort: REGAL }), { manage: true });
  assert.ok(buero.includes('data-ziel="artikel"'));
  assert.ok(buero.includes('data-ziel="nachbestellung"'));
  assert.ok(buero.includes('Fach A1'));
});

test('das Gebinde wird beim Buchen genannt, wenn es mehr als eins ist', () => {
  const einzeln = buchenAnsicht(buchbarerZustand({ gebinde: 1 }), {}, {});
  assert.ok(!einzeln.includes('Gebinde'));

  const karton = buchenAnsicht(buchbarerZustand({ gebinde: 100 }), {}, {});
  assert.ok(karton.includes('Gebinde mit 100 Stück'));
});

test('die Baustellenauswahl erscheint nur mit Baustellen und nennt die Pflicht', () => {
  const ohne = buchenAnsicht(buchbarerZustand(), {}, {});
  assert.ok(!ohne.includes('stock-site'));

  const freiwillig = buchenAnsicht(buchbarerZustand(), {}, {
    baustellen: [{ id: 'b1', name: 'Neubau Schule' }]
  });
  assert.ok(freiwillig.includes('(freiwillig)'));
  assert.ok(freiwillig.includes('Ohne Baustelle'));

  const pflicht = buchenAnsicht(buchbarerZustand(), {}, {
    baustellen: [{ id: 'b1', name: 'Neubau Schule' }], baustellePflicht: true
  });
  assert.ok(!pflicht.includes('(freiwillig)'));
  assert.ok(pflicht.includes('Bitte wählen'));
});

test('Artikelnamen aus fremder Feder können kein Markup einschleusen', () => {
  const boese = {
    ...ARTIKEL,
    name: '<img src=x onerror="alert(1)">',
    itemNumber: '"><script>böse</script>'
  };
  const html = buchenAnsicht(buchbarerZustand({ artikel: boese }), {}, {});

  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x'));
});

// ---------------------------------------------------------------------------
// Bueroansichten
// ---------------------------------------------------------------------------

const BESTANDSZEILEN = [
  { itemId: 'a2', itemName: 'NYM-J 3×1,5', itemNumber: 'LAG-0002', unit: 'Meter', locationId: 'ort-0', locationName: 'Materiallager', quantity: 150 },
  { itemId: 'a1', itemName: 'Schalterdose tief', itemNumber: 'LAG-0001', unit: 'Stück', locationId: 'ort-2', locationName: 'Fach A1', quantity: -12 },
  { itemId: 'a1', itemName: 'Schalterdose tief', itemNumber: 'LAG-0001', unit: 'Stück', locationId: 'ort-0', locationName: 'Materiallager', quantity: 420 }
];

test('der Bestand wird nach Lagerplatz gebündelt und alphabetisch sortiert', () => {
  const orte = bestandNachOrt(BESTANDSZEILEN);

  assert.deepEqual(orte.map((ort) => ort.name), ['Fach A1', 'Materiallager']);
  assert.deepEqual(
    orte[1].zeilen.map((zeile) => zeile.itemName),
    ['NYM-J 3×1,5', 'Schalterdose tief']
  );
  assert.deepEqual(bestandNachOrt([]), []);
});

test('der Deckungsgrad sagt, wie weit ein Artikel unter dem Mindestbestand liegt', () => {
  assert.equal(deckungsgrad({ totalQuantity: 25, minimumStock: 50 }), 0.5);
  assert.equal(deckungsgrad({ totalQuantity: 50, minimumStock: 50 }), 1);
  assert.equal(deckungsgrad({ totalQuantity: -10, minimumStock: 50 }), 0,
    'Ein Minusbestand ist leer, nicht negativ gedeckt');
  assert.equal(deckungsgrad({ totalQuantity: 5, minimumStock: 0 }), null);
  assert.equal(deckungsgrad(null), null);
});

test('der Nachbestellvorschlag stellt das Dringendste nach oben', () => {
  const zeilen = nachbestellungZeilen([
    { id: 'b', name: 'Halb voll', totalQuantity: 25, minimumStock: 50 },
    { id: 'a', name: 'Leer', totalQuantity: 0, minimumStock: 20 },
    { id: 'c', name: 'Fast voll', totalQuantity: 45, minimumStock: 50 }
  ]);

  assert.deepEqual(zeilen.map((zeile) => zeile.id), ['a', 'b', 'c']);
  assert.equal(zeilen[0].deckung, 0);
});

test('Stammdatenmengen dürfen null sein, aber kein Unsinn', () => {
  assert.equal(bestandsmengeAusText('50'), 50);
  assert.equal(bestandsmengeAusText('0'), 0, 'Null ist ein gültiger Mindestbestand');
  assert.equal(bestandsmengeAusText('12,5'), 12.5);
  assert.equal(bestandsmengeAusText(''), null);
  assert.equal(bestandsmengeAusText(null), null);
  assert.equal(bestandsmengeAusText('abc'), undefined);
  assert.equal(bestandsmengeAusText('-5'), undefined);
});

test('das Artikelformular weist zurück, was die API auch zurückwiese', () => {
  const gut = artikelFormularLesen({
    itemNumber: ' lag-0007 ', name: 'Klemme 3-fach', unit: 'Stück',
    groupKey: 'installation', minimumStock: '100', targetStock: '400',
    manufacturerNumber: '2273-203',
    barcodes: [{ code: '4006381333931', codeType: 'gtin', packQuantity: 1, isPrimary: true }]
  });

  assert.equal(gut.fehler, undefined);
  assert.equal(gut.entwurf.itemNumber, 'LAG-0007');
  assert.equal(gut.entwurf.minimumStock, 100);
  assert.equal(gut.entwurf.manufacturerNumber, '2273-203');
  assert.equal(gut.entwurf.barcodes.length, 1);

  const felder = { itemNumber: 'X', name: 'Y', unit: 'Stück', groupKey: 'other' };
  assert.match(artikelFormularLesen({ ...felder, itemNumber: '' }).fehler, /Artikelnummer/);
  assert.match(artikelFormularLesen({ ...felder, name: '  ' }).fehler, /Bezeichnung/);
  assert.match(artikelFormularLesen({ ...felder, unit: '' }).fehler, /Einheit/);
  assert.match(artikelFormularLesen({ ...felder, groupKey: '' }).fehler, /Warengruppe/);
  assert.match(artikelFormularLesen({ ...felder, minimumStock: 'viel' }).fehler, /Mindestbestand/);
  assert.match(
    artikelFormularLesen({ ...felder, minimumStock: '100', targetStock: '50' }).fehler,
    /Zielbestand/
  );
  assert.match(
    artikelFormularLesen({
      ...felder,
      barcodes: [
        { code: 'A', isPrimary: true, packQuantity: 1 },
        { code: 'B', isPrimary: true, packQuantity: 1 }
      ]
    }).fehler,
    /Hauptcode/
  );
});

test('leere Codezeilen im Formular werden verworfen statt abgelehnt', () => {
  const { entwurf } = artikelFormularLesen({
    itemNumber: 'LAG-1', name: 'Test', unit: 'Stück', groupKey: 'other',
    barcodes: [{ code: '  ' }, { code: 'KAB-1', packQuantity: 5 }]
  });

  assert.equal(entwurf.barcodes.length, 1);
  assert.equal(entwurf.barcodes[0].code, 'KAB-1');
  assert.equal(entwurf.barcodes[0].packQuantity, 5);
  assert.equal(entwurf.barcodes[0].codeType, 'internal');
});

test('die Bestandsansicht nennt Lagerplätze und kennzeichnet Minusbestände', () => {
  const html = bestandAnsicht(BESTANDSZEILEN);

  assert.ok(html.includes('Fach A1'));
  assert.ok(html.includes('Materiallager'));
  assert.ok(html.includes('stock-row__amount--unplausibel'), 'Ein Minusbestand muss auffallen');
  assert.ok(html.includes('-12 Stück'));
  assert.ok(bestandAnsicht([]).includes('noch nichts gebucht'));
});

test('die Artikelliste bietet das Anlegen nur der Verwaltung an', () => {
  const artikel = [{ id: 'a1', name: 'Dose', itemNumber: 'LAG-1', unit: 'Stück', totalQuantity: 10, minimumStock: 50 }];

  assert.ok(!artikelListeAnsicht(artikel, {}).includes('stock-new'));
  assert.ok(artikelListeAnsicht(artikel, { manage: true }).includes('stock-new'));
  assert.ok(artikelListeAnsicht(artikel, {}).includes('stock-row__amount--knapp'));
  assert.ok(artikelListeAnsicht([], { manage: true }).includes('Noch kein Artikel'));
});

test('der Nachbestellvorschlag zeigt Lieferant und Vorschlagsmenge', () => {
  const html = nachbestellungAnsicht([
    { id: 'a', name: 'Dose', unit: 'Stück', totalQuantity: 10, minimumStock: 50, suggestedQuantity: 290, supplierName: 'Sonepar' }
  ]);

  assert.ok(html.includes('Sonepar'));
  assert.ok(html.includes('+ 290 Stück'));
  assert.ok(html.includes('10 Stück von 50'));
  assert.ok(nachbestellungAnsicht([]).includes('Kein Artikel liegt unter'));
});

test('das Artikelformular übernimmt den gescannten Code sichtbar', () => {
  const gruppen = [{ key: 'installation', name: 'Installationsmaterial' }];
  const entwurf = artikelEntwurfAusScan(
    { art: 'gtin', wert: '05901234123457', roh: '5901234123457' }, gruppen
  );
  const html = artikelFormularAnsicht(entwurf, gruppen);

  assert.ok(html.includes('5901234123457'));
  assert.ok(html.includes('wird übernommen'));
  assert.ok(html.includes('selected'));
  assert.ok(artikelFormularAnsicht({}, [], 'Die Artikelnummer fehlt.').includes('Die Artikelnummer fehlt.'));
});

test('die Büroansichten hängen am Schritt und haben alle einen Rückweg', () => {
  const optionen = {
    bestand: BESTANDSZEILEN,
    artikel: [{ id: 'a', name: 'Dose', itemNumber: 'L-1', unit: 'Stück', totalQuantity: 1 }],
    vorschlaege: [],
    gruppen: [{ key: 'other', name: 'Sonstiges' }]
  };

  assert.ok(ansichtFuer(lagerZustand({ schritt: SCHRITTE.BESTAND }), {}, optionen).includes('Fach A1'));
  assert.ok(ansichtFuer(lagerZustand({ schritt: SCHRITTE.ARTIKEL }), {}, optionen).includes('Dose'));
  assert.ok(ansichtFuer(lagerZustand({ schritt: SCHRITTE.NACHBESTELLUNG }), {}, optionen).includes('Kein Artikel'));
  assert.ok(ansichtFuer(lagerZustand({ schritt: SCHRITTE.ARTIKEL_NEU }), {}, optionen).includes('Artikel anlegen'));

  for (const schritt of [SCHRITTE.BESTAND, SCHRITTE.ARTIKEL, SCHRITTE.NACHBESTELLUNG, SCHRITTE.ARTIKEL_NEU]) {
    assert.ok(
      ansichtFuer(lagerZustand({ schritt }), {}, optionen).includes('stock-home'),
      `${schritt} hat keinen Rückweg`
    );
  }
});

test('auch die Büroansichten maskieren fremden Text', () => {
  const html = bestandAnsicht([{
    itemId: 'x', itemName: '<script>böse</script>', itemNumber: 'L-1',
    unit: 'Stück', locationId: 'o', locationName: '"><b>Ort</b>', quantity: 1
  }]);

  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>Ort</b>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// Inventur
// ---------------------------------------------------------------------------

const INVENTUR = {
  session: { id: 'inv-1', locationId: REGAL.id, locationName: 'Fach A1', status: 'running' },
  lines: [
    { itemId: 'art-1', itemName: 'Schalterdose tief', unit: 'Stück', expectedQuantity: 100, countedQuantity: 98, difference: -2 },
    { itemId: 'art-2', itemName: 'NYM-J 3×1,5', unit: 'Meter', expectedQuantity: 40, countedQuantity: 40, difference: 0 },
    { itemId: 'art-3', itemName: 'Klemme', unit: 'Stück', expectedQuantity: 12, countedQuantity: null, difference: null }
  ]
};

test('beim Zählen ist null gültig, leer aber nicht', () => {
  assert.equal(zaehlmengeAusText('0'), 0, 'Ein leeres Fach ist ein Zählergebnis');
  assert.equal(zaehlmengeAusText('97'), 97);
  assert.equal(zaehlmengeAusText('3,5'), 3.5);
  assert.equal(zaehlmengeAusText(''), null, 'Nichts eingetragen ist keine Zählung');
  assert.equal(zaehlmengeAusText('   '), null);
  assert.equal(zaehlmengeAusText('-1'), null);
  assert.equal(zaehlmengeAusText('viel'), null);
});

test('der Fortschritt zählt Gezähltes, Offenes und Abweichungen getrennt', () => {
  assert.deepEqual(inventurFortschritt(INVENTUR.lines), {
    gesamt: 3, gezaehlt: 2, offen: 1, abweichungen: 1
  });
  assert.deepEqual(inventurFortschritt([]), { gesamt: 0, gezaehlt: 0, offen: 0, abweichungen: 0 });
});

test('die Abweichung wird als Vorzeichen gelesen, nicht als Vorwurf', () => {
  assert.equal(differenzText(-2, 'Stück'), '−2 Stück');
  assert.equal(differenzText(12, 'Stück'), '+12 Stück');
  assert.equal(differenzText(0, 'Stück'), 'stimmt');
  assert.equal(differenzText(null), 'noch nicht gezählt');

  assert.equal(differenzLage(null), 'offen');
  assert.equal(differenzLage(0), 'gut');
  assert.equal(differenzLage(5), 'mehr');
  assert.equal(differenzLage(-5), 'weniger');
});

test('ein Scan während der Inventur zählt, statt zu buchen', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.INVENTUR, inventur: INVENTUR });

  const gezaehlt = inventurScanVerarbeiten(zustand, {
    found: true, kind: 'item', packQuantity: 1,
    item: { id: 'art-1', name: 'Schalterdose tief', unit: 'Stück' }
  });
  assert.equal(gezaehlt.zaehlArtikel.id, 'art-1');
  assert.equal(gezaehlt.zaehlArtikel.erwartet, 100);
  assert.equal(gezaehlt.zaehlArtikel.bisher, 98);
  assert.equal(gezaehlt.menge, '', 'Das Feld bleibt leer, damit niemand den Sollwert bestätigt');
  assert.equal(gezaehlt.schritt, SCHRITTE.INVENTUR, 'Die Inventur wird nicht verlassen');

  // Ein Artikel, der hier gar nicht liegen sollte, hat Soll null.
  const fund = inventurScanVerarbeiten(zustand, {
    found: true, kind: 'item', packQuantity: 1,
    item: { id: 'art-9', name: 'Überraschung', unit: 'Stück' }
  });
  assert.equal(fund.zaehlArtikel.erwartet, 0);
  assert.equal(fund.zaehlArtikel.bisher, null);

  // Ein Lagerplatz oder ein unbekannter Code bucht nichts und wechselt nichts.
  const ort = inventurScanVerarbeiten(zustand, { found: true, kind: 'location', location: LAGER });
  assert.equal(ort.zaehlArtikel, null);
  assert.match(ort.fehler, /nur gezählt/);

  const unbekannt = inventurScanVerarbeiten(zustand, { found: false, kind: 'gtin', code: '123' });
  assert.match(unbekannt.fehler, /keinem Artikel/);
});

test('eine Zählung ohne Eingabe wird nicht übernommen', () => {
  const basis = lagerZustand({
    schritt: SCHRITTE.INVENTUR,
    inventur: INVENTUR,
    zaehlArtikel: { id: 'art-1', name: 'Dose', unit: 'Stück', erwartet: 100, bisher: null }
  });

  assert.match(zaehlungBauen({ ...basis, menge: '' }).fehler, /gezählte Menge/);
  assert.match(zaehlungBauen(lagerZustand({ menge: '5' })).fehler, /scannen/);

  assert.deepEqual(zaehlungBauen({ ...basis, menge: '97' }).zaehlung, { itemId: 'art-1', quantity: 97 });
  assert.deepEqual(zaehlungBauen({ ...basis, menge: '0' }).zaehlung, { itemId: 'art-1', quantity: 0 });
});

test('die Inventuransicht zeigt Fortschritt, Abweichungen und Rollen', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.INVENTUR, inventur: INVENTUR });

  const vorarbeiter = inventurAnsicht(zustand, { transfer: true });
  assert.ok(vorarbeiter.includes('2 von 3 gezählt'));
  assert.ok(vorarbeiter.includes('1 Abweichung'));
  assert.ok(vorarbeiter.includes('Fach A1'));
  assert.ok(vorarbeiter.includes('−2 Stück'));
  assert.ok(vorarbeiter.includes('noch nicht gezählt'));
  assert.ok(!vorarbeiter.includes('stock-inventory-done'), 'Der Vorarbeiter schließt nicht ab');
  assert.ok(vorarbeiter.includes('Abschließen kann das Büro'));

  const buero = inventurAnsicht(zustand, { transfer: true, manage: true });
  assert.ok(buero.includes('stock-inventory-done'));
  assert.ok(buero.includes('1 ungezählt'), 'Der Abschluss warnt vor ungezählten Zeilen');
});

test('ohne laufende Inventur bietet nur der Vorarbeiter den Start an', () => {
  const leer = lagerZustand({ schritt: SCHRITTE.INVENTUR });

  assert.ok(inventurAnsicht(leer, { transfer: true }).includes('stock-inventory-start'));
  assert.ok(!inventurAnsicht(leer, {}).includes('stock-inventory-start'));
  assert.ok(inventurAnsicht(leer, {}).includes('startet der Vorarbeiter'));
});

test('die Inventurkachel steht ab Vorarbeiter bereit', () => {
  assert.ok(!startAnsicht(lagerZustand(), {}).includes('data-ziel="inventur"'));
  assert.ok(startAnsicht(lagerZustand(), { transfer: true }).includes('data-ziel="inventur"'));
  assert.ok(startAnsicht(lagerZustand(), { manage: true, transfer: true }).includes('data-ziel="inventur"'));
});

// ---------------------------------------------------------------------------
// Bestellungen
// ---------------------------------------------------------------------------

const BESTELLUNG = {
  order: {
    id: 'best-1', orderNumber: 'B-2026-000042', supplierName: 'Sonepar',
    status: 'ordered', orderedAt: '2026-08-10T08:00:00.000Z'
  },
  lines: [
    { id: 'pos-1', linePosition: 1, itemId: 'art-1', itemName: 'Schalterdose tief', unit: 'Stück', quantityOrdered: 360, quantityReceived: 100, quantityOpen: 260 },
    { id: 'pos-2', linePosition: 2, itemId: 'art-2', itemName: 'NYM-J 3×1,5', unit: 'Meter', quantityOrdered: 500, quantityReceived: 500, quantityOpen: 0 }
  ]
};

test('jeder Bestellstatus hat einen deutschen Namen', () => {
  assert.equal(bestellStatusText('draft'), 'Entwurf');
  assert.equal(bestellStatusText('partially_received'), 'Teilweise geliefert');
  assert.equal(bestellStatusText('received'), 'Vollständig geliefert');
  assert.equal(Object.keys(BESTELLSTATUS).length, 5);
  assert.equal(bestellStatusText('unbekannt'), 'unbekannt', 'Nichts wird verschluckt');
});

test('der Fortschritt zählt offene Positionen', () => {
  assert.deepEqual(bestellungFortschritt(BESTELLUNG.lines), {
    positionen: 2, offen: 1, vollstaendig: false
  });
  assert.equal(bestellungFortschritt([{ quantityOpen: 0 }]).vollstaendig, true);
  assert.equal(bestellungFortschritt([]).vollstaendig, false, 'Leer ist nicht vollständig');
});

test('der Wareneingang bietet an, was offen ist', () => {
  assert.deepEqual(eingangVorbelegen(BESTELLUNG), { 'pos-1': '260' });
  assert.deepEqual(eingangVorbelegen(null), {});
});

function eingangZustand(zusatz = {}) {
  return lagerZustand({
    schritt: SCHRITTE.BESTELLUNG,
    ort: REGAL,
    bestellung: BESTELLUNG,
    ...zusatz
  });
}

test('gebucht wird nur, was eingetragen wurde', () => {
  const nurEine = wareneingangBauen(
    eingangZustand({ eingang: { 'pos-1': '260', 'pos-2': '' } }),
    { vorgangId: 'we-1' }
  );

  assert.equal(nurEine.fehler, undefined);
  assert.equal(nurEine.eingang.locationId, REGAL.id);
  assert.deepEqual(nurEine.eingang.lines, [
    { purchaseOrderItemId: 'pos-1', quantity: 260, clientOperationId: 'we-1-1' }
  ]);
});

test('jede Position bekommt eine eigene Vorgangsnummer', () => {
  const beide = wareneingangBauen(
    eingangZustand({ eingang: { 'pos-1': '100', 'pos-2': '5' } }),
    { vorgangId: 'we-2' }
  );

  assert.deepEqual(
    beide.eingang.lines.map((zeile) => zeile.clientOperationId),
    ['we-2-1', 'we-2-2'],
    'Eine wiederholte Übertragung muss Zeile für Zeile erkannt werden'
  );

  // Ohne übergebene Nummer entsteht jedes Mal eine neue.
  const a = wareneingangBauen(eingangZustand({ eingang: { 'pos-1': '1' } })).vorgangId;
  const b = wareneingangBauen(eingangZustand({ eingang: { 'pos-1': '1' } })).vorgangId;
  assert.notEqual(a, b);
});

test('ein Wareneingang ohne Menge, Ort oder Bestellung wird abgewiesen', () => {
  assert.match(wareneingangBauen(eingangZustand({ eingang: {} })).fehler, /mindestens eine Position/);
  assert.match(wareneingangBauen(eingangZustand({ eingang: { 'pos-1': '   ' } })).fehler, /mindestens eine Position/);
  assert.match(wareneingangBauen(eingangZustand({ ort: null, eingang: { 'pos-1': '1' } })).fehler, /Lagerplatz/);
  assert.match(wareneingangBauen(lagerZustand()).fehler, /keine Bestellung/);
  assert.match(
    wareneingangBauen(eingangZustand({ eingang: { 'pos-1': 'viel' } })).fehler,
    /Schalterdose tief/,
    'Der Fehler nennt die Zeile, um die es geht'
  );
});

test('die Bestellliste zeigt Lieferant, Nummer und Stand', () => {
  const html = bestellungenAnsicht([BESTELLUNG.order], { manage: true });

  assert.ok(html.includes('Sonepar'));
  assert.ok(html.includes('B-2026-000042'));
  assert.ok(html.includes('Teilweise geliefert') || html.includes('Bestellt'));
  assert.ok(html.includes('stock-order-from-reorder'));
  assert.ok(!bestellungenAnsicht([], {}).includes('stock-order-from-reorder'));
  assert.ok(bestellungenAnsicht([], {}).includes('Keine offene Bestellung'));
});

test('nur die Verwaltung sieht die Eingabefelder des Wareneingangs', () => {
  const zustand = eingangZustand({ eingang: eingangVorbelegen(BESTELLUNG) });

  const buero = bestellungAnsicht(zustand, { manage: true });
  assert.ok(buero.includes('stock-order__input'));
  assert.ok(buero.includes('stock-order-receive'));
  assert.ok(buero.includes('value="260"'));
  assert.ok(!buero.includes('stock-order-send'), 'Bestellt wird nur ein Entwurf');

  const monteur = bestellungAnsicht(zustand, {});
  assert.ok(!monteur.includes('stock-order__input'));
  assert.ok(!monteur.includes('stock-order-receive'));
  assert.ok(monteur.includes('noch 260'), 'Lesen darf er trotzdem');
  assert.ok(monteur.includes('vollständig'));
});

test('ein Entwurf wird bestellt, eine gelieferte Bestellung nicht mehr storniert', () => {
  const entwurf = eingangZustand({
    bestellung: { ...BESTELLUNG, order: { ...BESTELLUNG.order, status: 'draft' } }
  });
  const entwurfHtml = bestellungAnsicht(entwurf, { manage: true });
  assert.ok(entwurfHtml.includes('stock-order-send'));
  assert.ok(entwurfHtml.includes('stock-order-cancel'));
  assert.ok(!entwurfHtml.includes('stock-order-receive'), 'Ein Entwurf nimmt keine Ware an');

  const teilweise = eingangZustand({
    bestellung: { ...BESTELLUNG, order: { ...BESTELLUNG.order, status: 'partially_received' } }
  });
  const teilweiseHtml = bestellungAnsicht(teilweise, { manage: true });
  assert.ok(teilweiseHtml.includes('stock-order-receive'));
  assert.ok(!teilweiseHtml.includes('stock-order-cancel'), 'Gelieferte Ware lässt sich nicht wegstornieren');

  const fertig = eingangZustand({
    bestellung: { ...BESTELLUNG, order: { ...BESTELLUNG.order, status: 'received' } }
  });
  const fertigHtml = bestellungAnsicht(fertig, { manage: true });
  assert.ok(!fertigHtml.includes('stock-order-receive'));
  assert.ok(!fertigHtml.includes('stock-order-cancel'));
});

test('die Bestellkachel steht nur der Verwaltung offen', () => {
  assert.ok(!startAnsicht(lagerZustand(), { transfer: true }).includes('data-ziel="bestellungen"'));
  assert.ok(startAnsicht(lagerZustand(), { manage: true }).includes('data-ziel="bestellungen"'));
});

test('auch Bestellungen maskieren fremden Text', () => {
  const html = bestellungenAnsicht([{
    id: 'x', orderNumber: '"><b>B-1</b>', supplierName: '<script>böse</script>', status: 'ordered'
  }], {});

  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>B-1</b>'));
});
