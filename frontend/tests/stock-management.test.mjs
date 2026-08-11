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
  baustellenListe,
  baustelleNochWaehlbar,
  neueVorgangId,
  buchungVerarbeiten,
  bestandLage,
  bestandText,
  ortKurz,
  knappeArtikel,
  artikelEntwurfAusScan,
  offlineLagerQueueKey,
  wartendZeile,
  bestaetigungAnsicht,
  orteAnsicht,
  druckKnopf,
  artikelAlsEntwurf,
  einheitenFuer,
  faktorFuer,
  gebindeText,
  gebuchteMengeText,
  scanSpeicherStutzen,
  scanSpeicherKey,
  buchenAnsicht as buchenAnsichtOffline,
  warteschlangeEintrag,
  buchungBleibtInWarteschlange,
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
  bestellungAnsicht,
  ETIKETT_BOGEN,
  ETIKETTEN_JE_SEITE,
  etikettBogenStile,
  etikettBogenHtml,
  etikettZelle,
  codeArtText,
  leereCodezeile,
  codeNachtragLesen,
  artikelCodesAnsicht
} from '../core/stock-management.js';

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

  assert.equal(einzeln.einheit, 'einzeln');

  // Der Kartoncode stellt die Einheit auf Gebinde und die Menge auf eins:
  // "ein Karton". Gebucht werden trotzdem hundert Stück — die Umrechnung
  // steht in buchungBauen, damit im Journal genau eine Wahrheit liegt.
  const karton = scanVerarbeiten(mitOrt, {
    found: true, kind: 'item', packQuantity: 100, item: ARTIKEL, levels: []
  });
  assert.equal(karton.menge, '1');
  assert.equal(karton.einheit, 'gebinde');
  assert.equal(karton.gebinde, 100);
  assert.equal(karton.schritt, SCHRITTE.BUCHEN);
  assert.equal(buchungBauen(karton, {}).buchung.quantity, 100);
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

  // Die Rückgabe trägt die Baustelle mit: sie sagt, woher das Material kommt.
  // Ohne sie stünde im Journal eine Entnahme auf die Baustelle und daneben ein
  // Zugang aus dem Nichts — die Baustelle hätte alles verbraucht.
  const rueckgabe = buchungBauen(
    buchbarerZustand({ vorgang: 'rueckgabe', baustelleId: 'bau-1' }), { vorgangId: 'op-5' }
  );
  assert.equal(rueckgabe.buchung.constructionSiteId, 'bau-1');
  assert.equal(rueckgabe.buchung.movementType, 'return');

  // Eine Umlagerung geht von Lager zu Lager und keine Baustelle etwas an.
  const umlagerung = buchungBauen(
    buchbarerZustand({ vorgang: 'umlagerung', zielOrtId: 'ort-2', baustelleId: 'bau-1' }),
    { vorgangId: 'op-6' }
  );
  assert.equal(umlagerung.buchung.constructionSiteId, undefined);
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

test('ohne Gebinde gibt es keine Wahl, mit Gebinde zwei', () => {
  const einzeln = buchenAnsicht(buchbarerZustand({ gebinde: 1 }), {}, {});
  assert.ok(!einzeln.includes('stock-units'), 'Ein Knopf, der nichts zu wählen gibt, gehört weg');

  const karton = buchenAnsicht(buchbarerZustand({ gebinde: 100, einheit: 'gebinde' }), {}, {});
  assert.ok(karton.includes('stock-units'));
  assert.ok(karton.includes('data-einheit="einzeln"'), 'Einzeln ist immer erreichbar');
  assert.ok(karton.includes('data-einheit="gebinde"'));
  assert.ok(karton.includes('100 Stück'), 'Wie viel im Gebinde steckt, steht am Knopf');
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

test('das Feld nennt beide Richtungen: hin bei der Entnahme, her bei der Rückgabe', () => {
  const ansicht = buchenAnsicht(buchbarerZustand(), {}, {
    baustellen: [{ id: 'b1', name: 'Neubau Schule' }]
  });
  assert.match(ansicht, /Entnehmen geht das Material auf diese Baustelle/);
  assert.match(ansicht, /Zurückgeben\s+kommt es von dort ins Lager zurück/);
});

test('eigene Baustellen stehen oben, der Rest des Betriebs darunter', () => {
  const liste = baustellenListe(
    [{ id: 'b1', name: 'Neubau Schule' }],
    [{ id: 'b1', name: 'Neubau Schule' }, { id: 'b2', name: 'Altbau Post', siteNumber: 'B-2' }]
  );

  assert.deepEqual(liste.meine.map((eintrag) => eintrag.id), ['b1']);
  // Die eigene Baustelle steht genau einmal in der Liste, nicht in beiden
  // Gruppen: sonst wählt jemand die untere und wundert sich über die obere.
  assert.deepEqual(liste.weitere.map((eintrag) => eintrag.id), ['b2']);

  const ansicht = buchenAnsicht(buchbarerZustand(), {}, {
    eigeneBaustellen: [{ id: 'b1', name: 'Neubau Schule' }],
    baustellen: [{ id: 'b2', name: 'Altbau Post', siteNumber: 'B-2' }]
  });
  assert.ok(ansicht.includes('<optgroup label="Meine Baustellen">'));
  assert.ok(ansicht.includes('<optgroup label="Weitere Baustellen">'));
  assert.ok(ansicht.includes('Altbau Post (B-2)'), 'Die Nummer trennt gleichnamige Baustellen');

  // Nur eine Gruppe: dann ist eine Überschrift eine Überschrift ohne Aussage.
  const einzeln = buchenAnsicht(buchbarerZustand(), {}, {
    baustellen: [{ id: 'b2', name: 'Altbau Post' }]
  });
  assert.ok(!einzeln.includes('optgroup'));
});

test('eine abgeschlossene Baustelle gilt nicht mehr als wählbar', () => {
  const liste = baustellenListe([], [{ id: 'b2', name: 'Altbau Post' }]);

  assert.equal(baustelleNochWaehlbar('b2', liste), true);
  assert.equal(baustelleNochWaehlbar('weg', liste), false);
  // Ohne Baustelle ist immer in Ordnung - das Feld ist freiwillig.
  assert.equal(baustelleNochWaehlbar(null, liste), true);
});

test('die Bestätigung nennt die Baustelle und die Richtung', () => {
  const optionen = { baustellen: [{ id: 'b1', name: 'Neubau Schule' }] };

  const entnahme = buchungVerarbeiten(
    buchbarerZustand({ baustelleId: 'b1' }), { levels: [] }, optionen
  );
  assert.equal(entnahme.bestaetigung.baustelle, 'Neubau Schule');
  assert.match(bestaetigungAnsicht(entnahme), /Für Baustelle Neubau Schule/);

  const rueckgabe = buchungVerarbeiten(
    buchbarerZustand({ vorgang: 'rueckgabe', baustelleId: 'b1' }), { levels: [] }, optionen
  );
  assert.match(bestaetigungAnsicht(rueckgabe), /Zurück von Baustelle Neubau Schule/);

  // Ohne Baustelle steht dort kein leerer Satz.
  const ohne = buchungVerarbeiten(buchbarerZustand(), { levels: [] }, optionen);
  assert.equal(ohne.bestaetigung.baustelle, null);
  assert.ok(!bestaetigungAnsicht(ohne).includes('stock-done__site'));
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

test('ein Hinweis in der Bestellliste wird auch gezeigt', () => {
  // Ohne diese Zeile passiert beim Tippen sichtbar nichts, und niemand weiß,
  // warum keine Bestellung entstanden ist.
  const html = bestellungenAnsicht([], { manage: true }, 'Kein Artikel liegt unter seinem Mindestbestand.');
  assert.ok(html.includes('Kein Artikel liegt unter'));
  assert.ok(html.includes('role="alert"'));

  assert.ok(!bestellungenAnsicht([], { manage: true }).includes('role="alert"'));
});

// ---------------------------------------------------------------------------
// Codes und Etiketten
// ---------------------------------------------------------------------------

test('der Etikettenbogen passt in die Seitenbreite und auf ganze Reihen', () => {
  assert.equal(ETIKETTEN_JE_SEITE, ETIKETT_BOGEN.spalten * ETIKETT_BOGEN.reihen);

  const breite = ETIKETT_BOGEN.spalten * ETIKETT_BOGEN.zelleBreiteMm
    + (ETIKETT_BOGEN.spalten - 1) * ETIKETT_BOGEN.spaltMm;
  const hoehe = ETIKETT_BOGEN.reihen * ETIKETT_BOGEN.zelleHoeheMm
    + (ETIKETT_BOGEN.reihen - 1) * ETIKETT_BOGEN.spaltMm;
  assert.ok(breite <= ETIKETT_BOGEN.seiteBreiteMm - 2 * ETIKETT_BOGEN.seitenrandMm, `Breite ${breite}`);
  assert.ok(hoehe <= ETIKETT_BOGEN.seiteHoeheMm - 2 * ETIKETT_BOGEN.seitenrandMm, `Höhe ${hoehe}`);

  // Der Code muss auf das Etikett passen und darf die Textspalte nicht
  // erdrücken: er nimmt höchstens die Hälfte der Breite.
  assert.ok(ETIKETT_BOGEN.qrGroesseMm < ETIKETT_BOGEN.zelleHoeheMm, 'Der Code passt in die Höhe');
  assert.ok(ETIKETT_BOGEN.qrGroesseMm <= ETIKETT_BOGEN.zelleBreiteMm / 2, 'Neben dem Code bleibt Platz');

  const stile = etikettBogenStile();
  assert.ok(stile.includes('size:A4 portrait'));
  assert.ok(stile.includes(`${ETIKETT_BOGEN.qrGroesseMm}mm`));
  // Mehr als eine Seite darf entstehen; abgeschnitten wird nichts.
  assert.ok(!stile.includes('overflow:hidden}'), 'Der Druck schneidet keine Seite ab');
});

test('das Etikett trägt Bezeichnung, Code und Nummer wie ein Herstelleraufkleber', () => {
  const html = etikettZelle({
    targetType: 'item', svg: '<svg id="qr"></svg>',
    label: 'Schalterdose tief', sublabel: 'LAG-0001', extra: 'Kaiser 1055-04'
  });

  assert.ok(html.includes('label__name'));
  assert.ok(html.includes('Schalterdose tief'));
  assert.ok(html.includes('Art.-Nr.: LAG-0001'), 'Die Zahl allein macht ratlos');
  assert.ok(html.includes('Kaiser 1055-04'));
  assert.ok(html.includes('<svg id="qr"></svg>'));

  // Ein Lagerplatz hat keine Artikelnummer; dort wäre "Art.-Nr." gelogen.
  const ort = etikettZelle({
    targetType: 'location', svg: '<svg></svg>', label: 'Fach A1',
    sublabel: 'Materiallager › Regal A › Fach A1'
  });
  assert.ok(!ort.includes('Art.-Nr.'));
  assert.ok(ort.includes('Regal A'));

  // Ohne Zusatz bleibt die Zeile weg statt leer dazustehen.
  const knapp = etikettZelle({ targetType: 'item', label: 'Dose', sublabel: 'LAG-1' });
  assert.ok(!knapp.includes('label__extra'));
});

test('der Druckbogen verlinkt seine Stile, statt sie einzubetten', () => {
  // Die App laeuft unter `style-src 'self'`, und das Druckfenster erbt diese
  // Regel. Ein eingebetteter Block kam dort ohne eine einzige Regel an: der
  // Bogen druckte als Liste riesiger Codes über ganze Seiten.
  const html = etikettBogenHtml([{ label: 'x', svg: '<svg></svg>' }], 'https://app.example');
  assert.ok(!html.includes('<style'), 'Eingebettete Stile werden verworfen');
  assert.ok(html.includes('<link rel="stylesheet" href="https://app.example/print-labels.css'));

  // Absolut, denn das Druckfenster hat keine eigene Adresse.
  assert.ok(etikettBogenHtml([], 'https://app.example/').includes('https://app.example/print-labels.css'),
    'Ein Schrägstrich am Ende darf keine doppelte Adresse ergeben');
});

test('die ausgelieferte Stildatei ist die des Bogens', async () => {
  // Sonst laufen Datei und Erzeuger auseinander, und niemand merkt es: der
  // Bogen sieht im Test richtig aus und im Druck falsch.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const hier = dirname(fileURLToPath(import.meta.url));
  const datei = readFileSync(join(hier, '..', 'print-labels.css'), 'utf8');

  assert.ok(datei.includes(etikettBogenStile().trim()), 'Die Datei enthält die erzeugten Regeln');
  assert.ok(datei.includes(`${ETIKETT_BOGEN.zelleBreiteMm}mm`));
});

test('der Druckbogen setzt die Bilder ein und maskiert die Beschriftung', () => {
  const html = etikettBogenHtml([
    { svg: '<svg id="qr"></svg>', label: 'Kabeltrommel', sublabel: 'LAG-0002' },
    { svg: '<svg></svg>', label: '<script>böse</script>', sublabel: '"><b>x</b>' }
  ]);

  assert.ok(html.includes('<svg id="qr"></svg>'), 'Das eigene SVG bleibt unverändert');
  assert.ok(html.includes('Kabeltrommel'));
  assert.ok(html.includes('LAG-0002'));
  assert.ok(!html.includes('<script>böse'), 'Text aus der Datenbank wird maskiert');
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.startsWith('<!doctype html>'));

  // Der Bogen nimmt so viele auf, wie die Schnittstelle höchstens liefert.
  const viele = etikettBogenHtml(Array.from({ length: 200 }, () => ({ svg: '<svg></svg>', label: 'x' })));
  assert.equal((viele.match(/class="label"/g) || []).length, ETIKETT_BOGEN.maxEtiketten);
});

test('jede Codeart hat einen verständlichen Namen', () => {
  assert.equal(codeArtText('gtin'), 'Herstellercode');
  assert.equal(codeArtText('code128'), 'Strichcode');
  assert.equal(codeArtText('internal'), 'Eigener Code');
  assert.equal(codeArtText(undefined), 'Eigener Code');
});

test('ein nachgetragener Code wird geprüft wie beim Anlegen', () => {
  assert.deepEqual(codeNachtragLesen({ code: ' 4006381333931 ', codeType: 'gtin' }).nachtrag, {
    code: '4006381333931', codeType: 'gtin', packQuantity: 1, isPrimary: false
  });
  assert.equal(codeNachtragLesen({ code: 'KARTON-1', packQuantity: '100' }).nachtrag.packQuantity, 100);
  assert.equal(codeNachtragLesen({ code: 'X', packQuantity: '2,5' }).nachtrag.packQuantity, 2.5);

  assert.match(codeNachtragLesen({}).fehler, /Code fehlt/);
  assert.match(codeNachtragLesen({ code: '   ' }).fehler, /Code fehlt/);
  assert.match(codeNachtragLesen({ code: 'X', packQuantity: '0' }).fehler, /Gebindemenge/);
  assert.match(codeNachtragLesen({ code: 'X'.repeat(65) }).fehler, /zu lang/);
});

test('das Anlegeformular hat Codezeilen und sagt, dass leer erlaubt ist', () => {
  const html = artikelFormularAnsicht({ unit: 'Stück' }, [{ key: 'other', name: 'Sonstiges' }]);

  assert.ok(html.includes('data-code-index="0"'), 'Auch ein leeres Formular hat eine Codezeile');
  assert.ok(html.includes('stock-code-row-add'));
  assert.ok(html.includes('Kein Barcode auf der Ware'));
  assert.ok(html.includes('eigenes Etikett drucken'));

  const zwei = artikelFormularAnsicht(
    { barcodes: [leereCodezeile(), { code: '96385074', packQuantity: 100 }] }, []
  );
  assert.ok(zwei.includes('data-code-index="1"'));
  assert.ok(zwei.includes('value="96385074"'));
  assert.ok(zwei.includes('value="100"'));
});

test('die Codeansicht nennt Art, Gebinde und Hauptcode', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.ARTIKEL_CODES,
    artikel: ARTIKEL,
    codes: [
      { id: 'c1', code: '4006381333931', codeType: 'gtin', packQuantity: 1, isPrimary: true },
      { id: 'c2', code: '96385074', codeType: 'gtin', packQuantity: 100, isPrimary: false }
    ]
  });

  const buero = artikelCodesAnsicht(zustand, { manage: true });
  assert.ok(buero.includes('Herstellercode'));
  assert.ok(buero.includes('Gebinde 100'));
  assert.ok(buero.includes('Hauptcode'));
  assert.ok(buero.includes('stock-code-revoke'));
  assert.ok(buero.includes('stock-label-print'));
  assert.ok(buero.includes('stock-code-scan'));

  const monteur = artikelCodesAnsicht(zustand, {});
  assert.ok(!monteur.includes('stock-code-revoke'), 'Der Monteur nimmt keine Codes zurück');
  assert.ok(!monteur.includes('stock-label-print'));
  assert.ok(monteur.includes('4006381333931'), 'Lesen darf er');
});

test('ein Artikel ohne Code sagt, dass er nicht scannbar ist', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.ARTIKEL_CODES, artikel: ARTIKEL, codes: []
  });

  const html = artikelCodesAnsicht(zustand, { manage: true });
  assert.ok(html.includes('lässt sich also nicht scannen'));
  assert.ok(html.includes('eigenes Etikett'));
});

test('zur Codeansicht kommt nur die Verwaltung', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: ARTIKEL });

  assert.ok(!buchenAnsicht(zustand, {}, {}).includes('stock-codes-open'));
  assert.ok(buchenAnsicht(zustand, { manage: true }, {}).includes('stock-codes-open'));

  const optionen = { gruppen: [] };
  assert.ok(
    ansichtFuer(lagerZustand({ schritt: SCHRITTE.ARTIKEL_CODES, artikel: ARTIKEL, codes: [] }), { manage: true }, optionen)
      .includes('Codes und Etikett')
  );
});

// ---------------------------------------------------------------------------
// Ohne Netz
// ---------------------------------------------------------------------------

test('ohne Netz gebucht: die Bestaetigung nennt keinen Bestand, den niemand kennt', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: ARTIKEL, menge: '5', vorgang: 'entnahme'
  });

  const nachher = buchungVerarbeiten(zustand, { offline: true });
  assert.equal(nachher.schritt, SCHRITTE.BESTAETIGT);
  assert.equal(nachher.bestaetigung.offline, true);
  assert.equal(nachher.bestaetigung.neuerBestand, null, 'Geraten wird nicht');
  assert.equal(nachher.bestaetigung.menge, 5);

  const html = bestaetigungAnsicht(nachher);
  assert.ok(html.includes('Ohne Verbindung gebucht'));
  assert.ok(html.includes('nachgetragen'));
  assert.ok(!html.includes('Neuer Bestand hier'));
});

test('mit Netz bleibt die Bestaetigung, wie sie war', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: ARTIKEL, menge: '5', vorgang: 'entnahme'
  });

  const nachher = buchungVerarbeiten(zustand, {
    levels: [{ locationId: REGAL.id, quantity: 95 }]
  });
  assert.equal(nachher.bestaetigung.offline, false);
  assert.equal(nachher.bestaetigung.neuerBestand, 95);
  assert.ok(bestaetigungAnsicht(nachher).includes('Neuer Bestand hier'));
  assert.ok(!bestaetigungAnsicht(nachher).includes('Ohne Verbindung'));
});

test('wartende Buchungen stehen auf der Startseite, nicht in einer Ecke', () => {
  assert.equal(wartendZeile(0), '', 'Ohne Wartende steht dort nichts');
  assert.ok(wartendZeile(1).includes('Eine Buchung wartet'));
  assert.ok(wartendZeile(1).includes('wird'), 'Einzahl');
  assert.ok(wartendZeile(3).includes('3 Buchungen warten'));
  assert.ok(wartendZeile(3).includes('werden'), 'Mehrzahl');

  const start = startAnsicht(lagerZustand({ ort: REGAL, wartend: 2 }), {});
  assert.ok(start.includes('2 Buchungen warten'));
  assert.ok(!startAnsicht(lagerZustand({ ort: REGAL }), {}).includes('warten'));
});

test('der Zustand kennt die Zahl der Wartenden von Anfang an', () => {
  // Ein Schluessel, der je nach Weg auftaucht und verschwindet, laesst
  // Vergleiche gegen null mal stimmen und mal nicht.
  assert.equal(lagerZustand().wartend, 0);
  assert.equal(lagerZustand({ wartend: 4 }).wartend, 4);
});

test('ein wartender Eintrag sagt, was gebucht werden sollte', () => {
  const zustand = lagerZustand({
    ort: REGAL, artikel: ARTIKEL, menge: '2,5', vorgang: 'entnahme'
  });
  const { buchung } = buchungBauen(zustand, {});
  const eintrag = warteschlangeEintrag(zustand, buchung, new Date('2026-08-10T09:00:00Z'));

  assert.equal(eintrag.buchung.clientOperationId, buchung.clientOperationId,
    'Dieselbe Vorgangsnummer — daran haengt, dass sie nur einmal zaehlt');
  assert.equal(eintrag.beschreibung, `2,5 ${ARTIKEL.unit} ${ARTIKEL.name}`);
  assert.equal(eintrag.vorgang, 'Entnehmen');
  assert.equal(eintrag.gestellt, '2026-08-10T09:00:00.000Z');
});

test('ein Eintrag ohne Angaben bleibt trotzdem lesbar', () => {
  const eintrag = warteschlangeEintrag(lagerZustand({ menge: '' }), { itemId: 'x' });
  assert.equal(eintrag.beschreibung, 'Buchung ohne Angaben');

  // Ein Artikel ohne lesbare Menge nennt wenigstens den Artikel.
  const nurArtikel = warteschlangeEintrag(lagerZustand({ menge: '', artikel: ARTIKEL }), {});
  assert.equal(nurArtikel.beschreibung, `${ARTIKEL.unit} ${ARTIKEL.name}`);
});

test('nur das Netz laesst eine Buchung in der Schlange', () => {
  const netz = new Error('Der Server ist momentan nicht erreichbar.');
  netz.network = true;
  assert.equal(buchungBleibtInWarteschlange(netz), true);

  // Wer das Recht nicht hat, hat es beim naechsten Versuch auch nicht: die
  // Buchung faellt heraus, statt jeden Nachtrag danach aufzuhalten.
  const abgelehnt = new Error('Für diese Buchung fehlt die Berechtigung.');
  abgelehnt.code = 'stock_movement_forbidden';
  assert.equal(buchungBleibtInWarteschlange(abgelehnt), false);
  assert.equal(buchungBleibtInWarteschlange(null), false);
});

// ---------------------------------------------------------------------------
// Lagerplatz waehlen und Artikel suchen
// ---------------------------------------------------------------------------

const ORTE = [
  { id: 'ort-0', name: 'Materiallager', path: 'Materiallager' },
  { id: 'ort-1', name: 'Fach A1', path: 'Materiallager › Regal A › Fach A1' },
  { id: 'ort-2', name: 'Fach A1', path: 'Werkstatt › Regal A › Fach A1' }
];

test('die Ortsauswahl zeigt den vollen Pfad und markiert den aktuellen', () => {
  const html = orteAnsicht(ORTE, 'ort-1');

  // Zwei Plaetze heissen "Fach A1". Ohne den Pfad waeren sie nicht zu
  // unterscheiden, und es wuerde ins falsche Regal gebucht.
  assert.ok(html.includes('Materiallager › Regal A › Fach A1'));
  assert.ok(html.includes('Werkstatt › Regal A › Fach A1'));
  assert.ok(html.includes('data-ort="ort-1"'));
  assert.ok(html.includes('stock-row--gewaehlt'));
  assert.equal((html.match(/gewählt</g) || []).length, 1, 'Genau einer ist gewaehlt');
});

test('ohne Lagerplatz sagt die Auswahl das, statt leer zu bleiben', () => {
  assert.ok(orteAnsicht([]).includes('kein Lagerplatz angelegt'));
});

test('die Artikelliste hat ein Suchfeld, das den Begriff behaelt', () => {
  const html = artikelListeAnsicht([], { manage: true }, 'dose');
  assert.ok(html.includes('stock-search__input'));
  assert.ok(html.includes('value="dose"'));
  assert.ok(html.includes('Kein Artikel passt zu dieser Suche.'));

  // Ohne Suche liest sich die leere Liste anders: dann ist wirklich nichts da.
  assert.ok(artikelListeAnsicht([], {}, '').includes('Noch kein Artikel angelegt.'));
});

test('der Suchbegriff wird beim Anzeigen mitgegeben und maskiert', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.ARTIKEL, suche: '<script>' });
  const html = ansichtFuer(zustand, { manage: true }, { artikel: [] });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('die Ortsauswahl haengt am Schritt und kennt den gewaehlten Ort', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.ORTE, ort: ORTE[2] });
  const html = ansichtFuer(zustand, {}, { orte: ORTE });
  assert.ok(html.includes('data-ort="ort-2"'));
  assert.ok(html.includes('stock-row--gewaehlt'));
});

// ---------------------------------------------------------------------------
// Der Zwischenspeicher der Scans
// ---------------------------------------------------------------------------

test('der Scanspeicher wirft das Aelteste weg, nicht das Naechstbeste', () => {
  const speicher = {};
  for (let i = 0; i < 10; i += 1) {
    speicher[`code-${i}`] = { scan: { found: true }, gesehen: `2026-08-${String(i + 1).padStart(2, '0')}T08:00:00.000Z` };
  }

  const gestutzt = scanSpeicherStutzen(speicher, 3);
  assert.deepEqual(Object.keys(gestutzt).sort(), ['code-7', 'code-8', 'code-9'],
    'Die drei zuletzt gesehenen bleiben');
});

test('der Scanspeicher haengt an Firma und Mensch', () => {
  const a = scanSpeicherKey({ company: { number: 'F-000001' }, user: { id: 'u1' } });
  const b = scanSpeicherKey({ company: { number: 'F-000002' }, user: { id: 'u1' } });
  assert.notEqual(a, b, 'Zwei Firmen teilen sich keinen Speicher');
  assert.match(scanSpeicherKey(null), /unknown:unknown$/);
});

test('ein Artikel aus dem Zwischenspeicher sagt, dass er von vorhin stammt', () => {
  const zustand = lagerZustand({ ort: REGAL });
  const ausSpeicher = scanVerarbeiten(zustand, {
    found: true, kind: 'item', packQuantity: 1, item: ARTIKEL,
    levels: [{ locationId: REGAL.id, quantity: 40 }],
    offline: true
  });

  assert.equal(ausSpeicher.bestandVeraltet, true);
  assert.equal(ausSpeicher.bestandAmOrt, 40, 'Die letzte bekannte Zahl bleibt stehen');
  const html = buchenAnsichtOffline(ausSpeicher, {}, {});
  assert.ok(html.includes('Ohne Netz'));
  assert.ok(html.includes('vom letzten Scan mit'));
  assert.ok(html.includes('40'), 'Die Zahl wird nicht verschwiegen, nur eingeordnet');

  // Mit Netz steht dort kein Hinweis.
  const frisch = scanVerarbeiten(zustand, {
    found: true, kind: 'item', packQuantity: 1, item: ARTIKEL,
    levels: [{ locationId: REGAL.id, quantity: 40 }]
  });
  assert.equal(frisch.bestandVeraltet, false);
  assert.ok(!buchenAnsichtOffline(frisch, {}, {}).includes('Ohne Netz'));
});

test('ein gescannter Lagerplatz ist nie veraltet - ein Ort ist keine Menge', () => {
  const vorher = lagerZustand({ bestandVeraltet: true });
  const nachher = scanVerarbeiten(vorher, {
    found: true, kind: 'location', location: REGAL, offline: true
  });
  assert.equal(nachher.bestandVeraltet, false);
});

// ---------------------------------------------------------------------------
// Gebinde und Einzelstück
// ---------------------------------------------------------------------------

const KARTON = { ...ARTIKEL, packSize: 100, packName: 'Karton' };

test('ohne Gebinde bleibt nur das Einzelstueck', () => {
  const einheiten = einheitenFuer(ARTIKEL, 1);
  assert.equal(einheiten.length, 1);
  assert.equal(einheiten[0].schluessel, 'einzeln');
  assert.equal(einheiten[0].faktor, 1);
  assert.equal(einheiten[0].name, ARTIKEL.unit);
});

test('das Gebinde des Artikels steht zur Wahl, das Einzelstueck immer', () => {
  const einheiten = einheitenFuer(KARTON, 1);
  assert.deepEqual(einheiten.map((e) => e.schluessel), ['einzeln', 'gebinde']);
  assert.equal(einheiten[1].name, 'Karton');
  assert.equal(einheiten[1].faktor, 100);
});

test('der gescannte Karton schlaegt das Gebinde des Artikels', () => {
  // Wer einen Zehnerpack in der Hand hat, hat einen Zehnerpack — auch wenn am
  // Artikel ein Hunderterkarton steht.
  const einheiten = einheitenFuer(KARTON, 10);
  assert.equal(einheiten[1].faktor, 10);
  assert.equal(einheiten[1].name, 'Gebinde', 'Ein Zehnerpack heißt nicht Karton');

  // Stimmen beide überein, gilt der Name des Artikels.
  assert.equal(einheitenFuer(KARTON, 100)[1].name, 'Karton');
});

test('ein Gebinde mit einem Stueck ist keins', () => {
  assert.equal(einheitenFuer({ ...ARTIKEL, packSize: 1, packName: 'Karton' }, 1).length, 1);
  assert.equal(einheitenFuer(ARTIKEL, 1).length, 1);
  assert.equal(einheitenFuer(null, 0).length, 1);
});

test('gebucht wird in der Einheit des Artikels, egal was getippt wurde', () => {
  const basis = { schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: KARTON, vorgang: 'entnahme' };

  const zweiKartons = lagerZustand({ ...basis, einheit: 'gebinde', menge: '2' });
  assert.equal(faktorFuer(zweiKartons), 100);
  assert.equal(buchungBauen(zweiKartons, {}).buchung.quantity, 200);

  // Und genau das, was der Nutzer wollte: eine einzelne Dose.
  const eineDose = lagerZustand({ ...basis, einheit: 'einzeln', menge: '1' });
  assert.equal(faktorFuer(eineDose), 1);
  assert.equal(buchungBauen(eineDose, {}).buchung.quantity, 1);
});

test('krumme Gebindemengen runden auf drei Stellen wie die Datenbank', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, vorgang: 'entnahme', einheit: 'gebinde', menge: '0,5',
    artikel: { ...ARTIKEL, unit: 'Meter', packSize: 25.5, packName: 'Rolle' }
  });
  assert.equal(buchungBauen(zustand, {}).buchung.quantity, 12.75);
});

test('eine unbekannte Einheit rechnet nicht wild, sondern mit eins', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: KARTON, vorgang: 'entnahme',
    einheit: 'palette', menge: '3'
  });
  assert.equal(faktorFuer(zustand), 1);
  assert.equal(buchungBauen(zustand, {}).buchung.quantity, 3);
});

test('die Buchansicht sagt, was aus der getippten Menge wird', () => {
  const zweiKartons = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: KARTON, einheit: 'gebinde', menge: '2'
  });
  assert.equal(gebuchteMengeText(zweiKartons), '200 Stück');
  assert.ok(buchenAnsicht(zweiKartons, {}, {}).includes('Das sind 200 Stück'));

  // Einzeln braucht diese Zeile nicht: "5 Stück sind 5 Stück" ist Geschwätz.
  const einzeln = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: KARTON, einheit: 'einzeln', menge: '5'
  });
  assert.ok(!buchenAnsicht(einzeln, {}, {}).includes('Das sind'));
});

test('die Bestaetigung nennt beides: gebuchte Menge und Gebinde', () => {
  const zustand = lagerZustand({
    schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: KARTON,
    einheit: 'gebinde', menge: '2', vorgang: 'entnahme'
  });
  const nachher = buchungVerarbeiten(zustand, { levels: [] });

  assert.equal(nachher.bestaetigung.menge, 200);
  assert.equal(nachher.bestaetigung.einheit, 'Stück');
  assert.equal(nachher.bestaetigung.gewaehlt, '2 Karton');

  const html = bestaetigungAnsicht(nachher);
  assert.ok(html.includes('200 Stück'));
  assert.ok(html.includes('2 Karton'));

  // Nach der Buchung steht die Einheit wieder auf Einzeln: der nächste Scan
  // soll nicht ungefragt Kartons buchen.
  assert.equal(nachher.einheit, 'einzeln');
});

test('gebindeText schweigt, wo es nichts zu sagen gibt', () => {
  assert.equal(gebindeText(lagerZustand({ artikel: ARTIKEL, menge: '3' })), null);
  assert.equal(
    gebindeText(lagerZustand({ artikel: KARTON, einheit: 'gebinde', menge: '' })),
    null,
    'Ohne lesbare Menge kein Text'
  );
});

test('das Formular liest das Gebinde und weist die drei Halbheiten ab', () => {
  const grund = { itemNumber: 'A-1', name: 'Dose', unit: 'Stück', groupKey: 'other' };

  const mitGebinde = artikelFormularLesen({ ...grund, packName: 'Karton', packSize: '100' });
  assert.equal(mitGebinde.entwurf.packSize, 100);
  assert.equal(mitGebinde.entwurf.packName, 'Karton');

  const ohne = artikelFormularLesen(grund);
  assert.equal(ohne.entwurf.packSize, undefined);
  assert.equal(ohne.entwurf.packName, undefined);

  assert.match(artikelFormularLesen({ ...grund, packSize: '100' }).fehler, /Namen/);
  assert.match(artikelFormularLesen({ ...grund, packName: 'Karton' }).fehler, /Stückzahl/);
  assert.match(
    artikelFormularLesen({ ...grund, packName: 'Karton', packSize: '1' }).fehler,
    /mehr als ein Stück/
  );
  assert.match(
    artikelFormularLesen({ ...grund, packName: 'Karton', packSize: 'viele' }).fehler,
    /gültige Menge/
  );
});

// ---------------------------------------------------------------------------
// Etikettenbogen aus der Liste
// ---------------------------------------------------------------------------

const DREI = [
  { id: 'a1', name: 'Schalterdose', itemNumber: 'LAG-1', unit: 'Stück', totalQuantity: 10 },
  { id: 'a2', name: 'Kabel', itemNumber: 'LAG-2', unit: 'Meter', totalQuantity: 20 },
  { id: 'a3', name: 'Klemme', itemNumber: 'LAG-3', unit: 'Stück', totalQuantity: 30 }
];

test('ohne Auswahl lässt sich kein leerer Bogen drucken', () => {
  const html = druckKnopf(0);
  assert.ok(html.includes('disabled'), 'Ein Knopf, der nichts erzeugt, ist eine Falle');
  assert.ok(html.includes('Etiketten drucken'));
});

test('der Druckknopf sagt, wie viele es werden', () => {
  assert.ok(druckKnopf(1).includes('1 Etikett drucken'));
  assert.ok(!druckKnopf(1).includes('disabled'));
  assert.ok(druckKnopf(7).includes('7 Etiketten drucken'));
});

test('über 120 Etiketten sagt der Knopf das, statt in einen Fehler zu laufen', () => {
  // Die Schnittstelle nimmt nicht mehr an. Das gehört an den Knopf, bevor
  // jemand 300 anhakt und eine Fehlermeldung bekommt.
  const html = druckKnopf(200);
  assert.ok(html.includes('disabled'));
  assert.ok(html.includes('höchstens 120'));
});

test('die Artikelliste bietet Kästchen und einen Bogen — aber nur der Verwaltung', () => {
  const buero = artikelListeAnsicht(DREI, { manage: true }, '', ['a1', 'a3']);
  assert.ok(buero.includes('data-wahl="a1"'));
  assert.ok(buero.includes('2 Etiketten drucken'));
  assert.ok(buero.includes('Alle auswählen'));
  assert.equal((buero.match(/checked/g) || []).length, 2, 'Genau die zwei sind angehakt');

  // Der Monteur druckt keine Etiketten; ihm fehlt dafür auch das Recht in der
  // Schnittstelle, und ein Knopf, der danach abgewiesen wird, wäre gelogen.
  const monteur = artikelListeAnsicht(DREI, {}, '', []);
  assert.ok(!monteur.includes('stock-pick'));
  assert.ok(!monteur.includes('stock-sheet-print'));
});

test('sind alle angehakt, hebt derselbe Knopf die Auswahl wieder auf', () => {
  const alle = artikelListeAnsicht(DREI, { manage: true }, '', ['a1', 'a2', 'a3']);
  assert.ok(alle.includes('Auswahl aufheben'));
  assert.ok(alle.includes('3 Etiketten drucken'));
});

test('einzelne Lagerplätze lassen sich beschriften, nicht nur alle', () => {
  // Wer nachträglich ein Fach beschriftet, will nicht den ganzen Satz drucken.
  const eines = orteAnsicht(ORTE, 'ort-1', { manage: true }, ['ort-2']);
  assert.ok(eines.includes('data-wahl="ort-2"'));
  assert.ok(eines.includes('1 Etikett drucken'));
  assert.equal((eines.match(/checked/g) || []).length, 1);

  const alle = orteAnsicht(ORTE, null, { manage: true }, ORTE.map((o) => o.id));
  assert.ok(alle.includes(`${ORTE.length} Etiketten drucken`));
  assert.ok(alle.includes('Auswahl aufheben'));

  // Ohne Auswahl ist der Knopf da, aber abgeschaltet.
  assert.ok(orteAnsicht(ORTE, null, { manage: true }, []).includes('disabled'));

  assert.ok(!orteAnsicht(ORTE, 'ort-1', {}).includes('stock-pick'),
    'Wer nicht verwaltet, druckt keine Platzetiketten');
});

test('das Kästchen und die Zeile bleiben zwei verschiedene Griffe', () => {
  // Die Zeile setzt den Lagerplatz, das Kästchen wählt fürs Etikett. Stünde
  // beides am selben Element, könnte man nichts anhaken, ohne wegzuspringen.
  const html = orteAnsicht(ORTE, null, { manage: true }, []);
  assert.ok(html.includes('data-ort="ort-1"'));
  assert.ok(html.includes('data-wahl="ort-1"'));
});

test('der Zustand kennt die Druckauswahl von Anfang an', () => {
  assert.deepEqual(lagerZustand().druckwahl, []);
  assert.deepEqual(lagerZustand({ druckwahl: ['a1'] }).druckwahl, ['a1']);
});

// ---------------------------------------------------------------------------
// Artikel ändern
// ---------------------------------------------------------------------------

test('aus einem gespeicherten Artikel wird ein Formularentwurf', () => {
  const gruppen = [{ id: 'g1', key: 'installation', name: 'Installation' }];
  const entwurf = artikelAlsEntwurf({
    id: 'a1', itemNumber: 'LAG-1', name: 'Dose', unit: 'Stück', groupId: 'g1',
    manufacturerNumber: '1055-04', minimumStock: 50, targetStock: 300,
    packName: 'Karton', packSize: 100, rowVersion: 7
  }, gruppen);

  // Die Warengruppe kommt als Schlüssel zurück, denn danach wählt das Formular.
  assert.equal(entwurf.groupKey, 'installation');
  assert.equal(entwurf.packSize, 100);
  assert.equal(entwurf.rowVersion, 7, 'Ohne sie ließe sich nicht speichern');
  assert.equal(artikelAlsEntwurf(null), null);
});

test('beim Ändern sind Nummer, Einheit und Warengruppe gesperrt', () => {
  // Die Nummer steht auf gedruckten Etiketten, und die Einheit zu ändern würde
  // jeden gebuchten Bestand still umdeuten: aus 120 Metern würden 120 Stück.
  const entwurf = { itemNumber: 'LAG-1', name: 'Dose', unit: 'Meter', groupKey: 'other' };
  const html = artikelFormularAnsicht(entwurf, [{ key: 'other', name: 'Sonstiges' }], null, true);

  assert.ok(html.includes('Artikel ändern'));
  assert.ok(html.includes('Änderungen speichern'));
  assert.equal((html.match(/disabled/g) || []).length, 3, 'Genau die drei');
  assert.ok(html.includes('steht auf Etiketten'));
  assert.ok(html.includes('der Bestand zählt darin'));

  // Codes gehören in ihre eigene Ansicht, nicht ins Änderungsformular.
  assert.ok(!html.includes('data-code-index'));
  assert.ok(html.includes('Codes und Etikett'));
});

test('beim Anlegen ist nichts gesperrt und die Codezeilen sind da', () => {
  const html = artikelFormularAnsicht(null, [{ key: 'other', name: 'Sonstiges' }], null, false);
  assert.ok(html.includes('Artikel anlegen'));
  assert.ok(!html.includes('disabled'));
  assert.ok(html.includes('data-code-index'));
});

test('der Weg zum Ändern steht nur der Verwaltung offen', () => {
  const zustand = lagerZustand({ schritt: SCHRITTE.BUCHEN, ort: REGAL, artikel: ARTIKEL });
  assert.ok(!buchenAnsicht(zustand, {}, {}).includes('stock-item-edit'));
  assert.ok(buchenAnsicht(zustand, { manage: true }, {}).includes('stock-item-edit'));
});
