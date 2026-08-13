// Baustromverteiler: Ansichten und Verdrahtung.
//
// Der Zuschnitt folgt dem Geraetemodul: alles, was eine Entscheidung ist,
// steht in reinen Funktionen und laesst sich ohne Browser pruefen; darunter
// nur das, was ohne DOM nicht geht.
//
// WAS DIESE ANSICHT BEANTWORTET
//
// Nicht "welche Verteiler haben wir" - das beantwortet die Geraeteliste. Diese
// hier beantwortet "was liegt heute an": welcher Verteiler steht wo, welche
// Frist ist abgelaufen, wo muss jemand die Prueftaste druecken, wo fehlt ein
// Zaehlerstand fuer die Abrechnung.
//
// Deshalb sortiert sie nach Dringlichkeit und nicht nach Nummer, und deshalb
// stehen zwei Fristen nebeneinander statt einer gemittelten.

const LAGEN = Object.freeze({
  ueberfaellig: { wort: 'überfällig', klasse: 'schlecht' },
  nie: { wort: 'nie geprüft', klasse: 'unbekannt' },
  bald: { wort: 'bald fällig', klasse: 'knapp' },
  gut: { wort: 'in Ordnung', klasse: 'gut' }
});

export const ANLAESSE = Object.freeze({
  installation: 'Aufstellen',
  interim: 'Zwischenablesung',
  removal: 'Abbau'
});

function sicher(text) {
  return String(text ?? '').replace(/[&<>"']/g, (zeichen) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[zeichen]);
}

/** Aus 2026-08-12 wird 12.08.2026 - so steht es auf dem Papier daneben. */
export function datumText(iso) {
  if (!iso) return '';
  const [jahr, monat, tag] = String(iso).split('-');
  return `${tag}.${monat}.${jahr}`;
}

/**
 * Was eine Frist in Worten sagt.
 *
 * Tage statt Datum, solange es knapp ist: "in 3 Tagen" braucht niemand
 * auszurechnen, "am 15.08." schon. Ist es weit hin, ist das Datum die
 * ruhigere Angabe.
 */
export function fristText(lage, tage, faelligAm) {
  if (lage === 'nie') return 'noch nie geprüft';
  if (lage === 'ueberfaellig') {
    const her = Math.abs(tage);
    return `seit ${her} ${her === 1 ? 'Tag' : 'Tagen'} überfällig`;
  }
  if (lage === 'bald') return tage === 0 ? 'heute fällig' : `in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
  return `bis ${datumText(faelligAm)}`;
}

/**
 * Die dringendere der beiden Fristen.
 *
 * Die Zeile traegt eine Farbe, nicht zwei. Welche, entscheidet die schlimmere
 * Lage - ein Verteiler mit abgelaufener Pruefung ist rot, auch wenn die
 * Prueftaste gestern gedrueckt wurde.
 */
export function schlimmereLage(verteiler) {
  const rang = { ueberfaellig: 0, nie: 1, bald: 2, gut: 3 };
  const a = verteiler?.inspection?.lage || 'nie';
  const b = verteiler?.rcdTest?.lage || 'nie';
  return rang[a] <= rang[b] ? a : b;
}

/** Wo der Verteiler steht - Baustelle vor Lagerort, denn danach wird gesucht. */
export function standortText(verteiler) {
  if (verteiler?.constructionSiteName) return verteiler.constructionSiteName;
  if (verteiler?.locationName) return verteiler.locationName;
  return 'ohne Standort';
}

function fristZeile(titel, frist) {
  const lage = LAGEN[frist.lage] || LAGEN.nie;
  return `<span class="power-term power-term--${lage.klasse}">
    <strong>${sicher(titel)}</strong>
    ${sicher(fristText(frist.lage, frist.tage, frist.dueOn))}
  </span>`;
}

/**
 * Der Kopf der Liste.
 *
 * Er sagt in einem Satz, wonach hier sortiert wird. Ohne ihn beginnt die
 * Seite mitten in den Zeilen, und wer sie zum ersten Mal sieht, haelt die
 * Reihenfolge fuer zufaellig statt fuer die Antwort auf "was liegt an".
 */
function kopf() {
  return `<header class="power-heading">
    <p class="eyebrow">Betriebsmittelverwaltung</p>
    <h1>Baustrom</h1>
    <p class="power-heading__intro">
      Verteiler nach Dringlichkeit: abgelaufene Prüfung zuerst, dann der
      fällige FI-Test. Zählerstände stehen an der Baustelle, auf der abgelesen
      wurde.
    </p>
  </header>`;
}

export function listeAnsicht(verteiler = [], fehler = null) {
  return `<div class="power-list">
    ${kopf()}
    ${fehler ? `<p class="power-error" role="alert">${sicher(fehler)}</p>` : ''}
    ${verteiler.length
      ? `<ul class="power-rows">
          ${verteiler.map((eintrag) => {
            const lage = LAGEN[schlimmereLage(eintrag)] || LAGEN.nie;
            return `<li class="power-row power-row--${lage.klasse}" data-verteiler="${sicher(eintrag.id)}"
                        role="button" tabindex="0">
              <span class="power-row__name">${sicher(eintrag.name)}</span>
              <span class="power-row__meta">
                ${sicher(eintrag.inventoryNumber)} · ${sicher(standortText(eintrag))}
              </span>
              <span class="power-row__terms">
                ${fristZeile('Prüfung', eintrag.inspection)}
                ${fristZeile('FI-Test', eintrag.rcdTest)}
              </span>
              ${eintrag.meter
                ? `<span class="power-row__meter">Zähler ${sicher(eintrag.meter.readingKwh)} kWh
                     (${sicher(datumText(eintrag.meter.readOn))})</span>`
                : '<span class="power-row__meter power-row__meter--fehlt">noch kein Zählerstand</span>'}
            </li>`;
          }).join('')}
        </ul>`
      : `<p class="power-empty">
           Noch kein Baustromverteiler angelegt. Verteiler entstehen in
           „Maschinen &amp; Geräte“ mit der Kategorie „Baustromverteiler“ —
           hier stehen dann ihre Fristen und Zählerstände.
         </p>`}
  </div>`;
}

export function detailAnsicht(akte, fehler = null) {
  const verteiler = akte?.distributor;
  if (!verteiler) return '';

  return `<div class="power-detail">
    <button class="button button--quiet power-back" type="button">← Zurück</button>
    <h3 class="power-detail__name">${sicher(verteiler.name)}</h3>
    <p class="power-detail__meta">
      ${sicher(verteiler.inventoryNumber)} · ${sicher(standortText(verteiler))}
    </p>
    ${fehler ? `<p class="power-error" role="alert">${sicher(fehler)}</p>` : ''}

    <div class="power-terms">
      ${fristZeile('Prüfung nach DGUV V3', verteiler.inspection)}
      ${fristZeile('FI-Test', verteiler.rcdTest)}
    </div>
    <p class="power-hint">
      Der monatliche Druck auf die Prüftaste ersetzt die vierteljährliche
      Prüfung nicht und verschiebt ihren Termin nicht.
    </p>

    <div class="power-actions">
      <button class="button button--action power-rcd" type="button">FI-Test bestätigen</button>
      <button class="button button--secondary power-reading" type="button">Zählerstand erfassen</button>
    </div>

    <h4 class="power-subhead">Zählerstände</h4>
    ${akte.readings?.length
      ? `<ul class="power-records">
          ${akte.readings.map((zeile) => `
            <li>
              <span>${sicher(datumText(zeile.readOn))} · ${sicher(zeile.readingKwh)} kWh</span>
              <span>${sicher(ANLAESSE[zeile.reason] || zeile.reason)}${zeile.constructionSiteName
                ? ` · ${sicher(zeile.constructionSiteName)}`
                : ''} · ${sicher(zeile.readBy)}</span>
              ${zeile.note ? `<span class="power-records__note">${sicher(zeile.note)}</span>` : ''}
            </li>`).join('')}
        </ul>`
      : '<p class="power-empty">Noch keine Ablesung.</p>'}

    <h4 class="power-subhead">FI-Tests</h4>
    ${akte.rcdTests?.length
      ? `<ul class="power-records">
          ${akte.rcdTests.map((zeile) => `
            <li class="power-records__item--${zeile.result === 'passed' ? 'gut' : 'schlecht'}">
              <span>${sicher(datumText(zeile.testedOn))} · ${zeile.result === 'passed' ? 'bestanden' : 'nicht bestanden'}</span>
              <span>${sicher(zeile.testedBy)}${zeile.constructionSiteName
                ? ` · ${sicher(zeile.constructionSiteName)}`
                : ''}</span>
              ${zeile.note ? `<span class="power-records__note">${sicher(zeile.note)}</span>` : ''}
            </li>`).join('')}
        </ul>`
      : '<p class="power-empty">Noch kein FI-Test erfasst.</p>'}
  </div>`;
}

/**
 * Das Formular fuer eine Ablesung.
 *
 * Der Anlass steht oben und ist Pflicht: zwischen "Aufstellen" und "Abbau"
 * liegt die Rechnung, und wer das nachtraegt, weiss es in drei Monaten nicht
 * mehr.
 */
export function ablesungFormular(letzterStand = null) {
  return `<form class="power-form">
    <h4 class="power-subhead">Zählerstand erfassen</h4>
    ${letzterStand !== null
      ? `<p class="power-hint">Letzter Stand: ${sicher(letzterStand)} kWh</p>`
      : ''}
    <label class="power-field">
      <span>Anlass</span>
      <select name="reason">
        ${Object.entries(ANLAESSE).map(([schluessel, wort]) => `
          <option value="${sicher(schluessel)}"${schluessel === 'interim' ? ' selected' : ''}>
            ${sicher(wort)}
          </option>`).join('')}
      </select>
    </label>
    <label class="power-field">
      <span>Zählerstand in kWh</span>
      <input name="readingKwh" type="text" inputmode="decimal" required placeholder="z. B. 1850,5">
    </label>
    <label class="power-field">
      <span>Notiz <span class="power-field__optional">(optional)</span></span>
      <input name="note" type="text" maxlength="200" placeholder="z. B. Zähler getauscht">
    </label>
    <button class="button button--action" type="submit">Speichern</button>
    <button class="button button--quiet power-cancel" type="button">Abbrechen</button>
  </form>`;
}

/**
 * Das Formular fuer den FI-Test.
 *
 * Zwei Knoepfe statt eines: "bestanden" vorzubelegen waere ein Klick, der
 * immer dasselbe sagt. Ein durchgefallener RCD ist der eigentliche Grund,
 * warum es diesen Vorgang gibt.
 */
export function fiTestFormular() {
  return `<form class="power-form">
    <h4 class="power-subhead">FI-Test bestätigen</h4>
    <p class="power-hint">
      Prüftaste am Fehlerstromschutzschalter drücken. Löst er nicht aus, ist
      der Verteiler bis zur Instandsetzung nicht zu benutzen.
    </p>
    <label class="power-field">
      <span>Notiz <span class="power-field__optional">(optional)</span></span>
      <input name="note" type="text" maxlength="200">
    </label>
    <div class="power-actions">
      <button class="button button--action" type="submit" value="passed" name="result">Ausgelöst — bestanden</button>
      <button class="button button--danger power-failed" type="button">Nicht ausgelöst</button>
    </div>
    <button class="button button--quiet power-cancel" type="button">Abbrechen</button>
  </form>`;
}

/** Eine eingetippte Menge in eine Zahl - deutsche Schreibweise mit Komma. */
export function standAusText(text) {
  const roh = String(text ?? '').trim().replace(/\s/g, '');
  if (!roh) return null;
  const zahl = Number(roh.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(zahl) && zahl >= 0 ? zahl : null;
}

/**
 * Die Verdrahtung mit dem Browser.
 *
 * Bewusst schmal gehalten: Liste, Akte, zwei Formulare. Was ein Verteiler
 * ist - Name, Nummer, Standort, Kategorie -, wird in der Geraeteverwaltung
 * gepflegt, und dieser Bereich legt nichts an. Das haelt die Stammdaten an
 * einer Stelle und diese Ansicht bei dem, wofuer es sie gibt.
 */
export function createPowerModule({ root, requestJson, showToast }) {
  root.innerHTML = '<div class="power-view"></div>';
  const view = root.querySelector('.power-view');

  let enabled = false;
  let verteiler = [];
  let akte = null;
  let formular = null;
  let fehler = null;

  function render() {
    if (!akte) {
      view.innerHTML = listeAnsicht(verteiler, fehler);
    } else if (formular === 'reading') {
      view.innerHTML = detailAnsicht(akte, fehler) + ablesungFormular(
        akte.readings?.[0] ? akte.readings[0].readingKwh : null
      );
    } else if (formular === 'rcd') {
      view.innerHTML = detailAnsicht(akte, fehler) + fiTestFormular();
    } else {
      view.innerHTML = detailAnsicht(akte, fehler);
    }
    verdrahten();
  }

  function auf(auswahl, ereignis, hand) {
    view.querySelectorAll(auswahl).forEach((knoten) => knoten.addEventListener(ereignis, hand));
  }

  function verdrahten() {
    auf('[data-verteiler]', 'click', (e) => void oeffnen(e.currentTarget.dataset.verteiler));
    // Mit der Tastatur bedienbar: die Zeile ist ein Knopf, auch wenn sie wie
    // eine Zeile aussieht.
    auf('[data-verteiler]', 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void oeffnen(e.currentTarget.dataset.verteiler);
      }
    });
    auf('.power-back', 'click', () => { akte = null; formular = null; fehler = null; render(); });
    auf('.power-rcd', 'click', () => { formular = 'rcd'; fehler = null; render(); });
    auf('.power-reading', 'click', () => { formular = 'reading'; fehler = null; render(); });
    auf('.power-cancel', 'click', () => { formular = null; fehler = null; render(); });
    auf('.power-failed', 'click', () => void fiTestSenden('failed'));

    const form = view.querySelector('.power-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (formular === 'rcd') void fiTestSenden('passed');
      else void ablesungSenden();
    });
  }

  function notiz() {
    return view.querySelector('.power-form [name="note"]')?.value?.trim() || null;
  }

  async function laden() {
    try {
      const antwort = await requestJson('./api/v1/power/distributors');
      verteiler = antwort.distributors || [];
      fehler = null;
    } catch (error) {
      fehler = error.message;
    }
    render();
  }

  async function oeffnen(id) {
    try {
      akte = await requestJson(`./api/v1/power/distributors/${encodeURIComponent(id)}`);
      formular = null;
      fehler = null;
    } catch (error) {
      fehler = error.message;
    }
    render();
  }

  async function fiTestSenden(ergebnis) {
    try {
      await requestJson(`./api/v1/power/distributors/${encodeURIComponent(akte.distributor.id)}/rcd-test`, {
        method: 'POST',
        body: JSON.stringify({ result: ergebnis, note: notiz() })
      });
      showToast(ergebnis === 'passed'
        ? 'FI-Test bestätigt.'
        : 'Nicht bestanden — der Verteiler ist bis zur Instandsetzung gesperrt.');
      formular = null;
      await Promise.all([oeffnen(akte.distributor.id), laden()]);
    } catch (error) {
      fehler = error.message;
      render();
    }
  }

  async function ablesungSenden() {
    const stand = standAusText(view.querySelector('[name="readingKwh"]')?.value);
    if (stand === null) {
      fehler = 'Bitte einen Zählerstand eintragen.';
      render();
      return;
    }
    try {
      const antwort = await requestJson(
        `./api/v1/power/distributors/${encodeURIComponent(akte.distributor.id)}/readings`,
        {
          method: 'POST',
          body: JSON.stringify({
            readingKwh: stand,
            reason: view.querySelector('[name="reason"]')?.value || 'interim',
            note: notiz()
          })
        }
      );
      showToast(antwort.consumedKwh === null
        ? 'Zählerstand gespeichert.'
        : `Zählerstand gespeichert — ${antwort.consumedKwh} kWh seit der letzten Ablesung.`);
      formular = null;
      await Promise.all([oeffnen(akte.distributor.id), laden()]);
    } catch (error) {
      fehler = error.message;
      render();
    }
  }

  return {
    setEnabled(wert) {
      enabled = wert;
      if (!enabled) { verteiler = []; akte = null; }
    },
    async refresh() {
      if (!enabled) return;
      await laden();
    },
    clear() {
      enabled = false;
      verteiler = [];
      akte = null;
      formular = null;
      fehler = null;
      view.innerHTML = '';
    }
  };
}
