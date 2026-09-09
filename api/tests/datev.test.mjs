import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createPool, withTenantTransaction } from "../src/database.mjs";
import { handleDatevRequest } from "../src/datev.mjs";
import {
  validateDatevExportSettings,
  validateDatevPersonnelNumberAssignment,
  validateDatevWageTypeMapping
} from "../src/validation.mjs";

// Die reine Validierung braucht keine Datenbank und läuft deshalb immer.

test("DATEV-Stammdaten verlangen numerische Berater- und Mandantennummern und ein bekanntes Lohnprodukt", () => {
  assert.deepEqual(
    validateDatevExportSettings({
      consultantNumber: "1234567",
      clientNumber: "12345",
      payrollProduct: "lodas",
      rowVersion: 0
    }),
    { consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "lodas", rowVersion: 0 }
  );
  assert.throws(
    () => validateDatevExportSettings({
      consultantNumber: "ABCDEFG", clientNumber: "12345", payrollProduct: "lodas", rowVersion: 0
    }),
    /Beraternummer/
  );
  assert.throws(
    () => validateDatevExportSettings({
      consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "sonstwas", rowVersion: 0
    }),
    /Lohnprodukt/
  );
  assert.throws(
    () => validateDatevExportSettings({
      consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "lug", rowVersion: -1
    }),
    /Version/
  );
});

test("Eine Zeitart braucht eine Lohnart, eine Abwesenheitsart einen Ausfallschlüssel", () => {
  assert.deepEqual(
    validateDatevWageTypeMapping({
      category: "time_type", mappingKey: "work", wageTypeNumber: "1000"
    }),
    { category: "time_type", mappingKey: "work", wageTypeNumber: "1000", absenceCode: null, changeReason: null }
  );
  assert.deepEqual(
    validateDatevWageTypeMapping({
      category: "absence_type", mappingKey: "sick", absenceCode: "3", wageTypeNumber: "2100"
    }),
    { category: "absence_type", mappingKey: "sick", wageTypeNumber: "2100", absenceCode: "3", changeReason: null }
  );
  // Kein Schlüssel passt zur falschen Art - eine Abwesenheitsart ist keine
  // Zeitart, auch wenn beide dieselbe Tabelle teilen.
  assert.throws(
    () => validateDatevWageTypeMapping({ category: "time_type", mappingKey: "vacation", wageTypeNumber: "1000" }),
    /Schlüssel/
  );
  assert.throws(
    () => validateDatevWageTypeMapping({ category: "time_type", mappingKey: "travel" }),
    /Zeitart.*Lohnartennummer/
  );
  assert.throws(
    () => validateDatevWageTypeMapping({ category: "absence_type", mappingKey: "vacation" }),
    /Abwesenheitsart.*Ausfallschlüssel/
  );
  assert.throws(
    () => validateDatevWageTypeMapping({ category: "time_type", mappingKey: "overtime", wageTypeNumber: "AB12" }),
    /Lohnartennummer/
  );
  assert.throws(
    () => validateDatevWageTypeMapping({
      category: "absence_type", mappingKey: "sick", absenceCode: "123"
    }),
    /Ausfallschlüssel/
  );
});

test("Die DATEV-Personalnummer erlaubt ein bis fünf Ziffern ohne führende Null, oder ausdrücklich null zum Löschen", () => {
  assert.deepEqual(
    validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "1001", rowVersion: 4 }),
    { datevPersonnelNumber: "1001", rowVersion: 4 }
  );
  assert.deepEqual(
    validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "9", rowVersion: 0 }),
    { datevPersonnelNumber: "9", rowVersion: 0 }
  );
  // null ist ein eigener gültiger Wert - er löscht die Zuordnung - und kein
  // fehlendes Feld.
  assert.deepEqual(
    validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: null, rowVersion: 4 }),
    { datevPersonnelNumber: null, rowVersion: 4 }
  );
  assert.throws(
    () => validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "0123", rowVersion: 0 }),
    /DATEV-Personalnummer/
  );
  assert.throws(
    () => validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "123456", rowVersion: 0 }),
    /DATEV-Personalnummer/
  );
  assert.throws(
    () => validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "M-1", rowVersion: 0 }),
    /DATEV-Personalnummer/
  );
  assert.throws(
    () => validateDatevPersonnelNumberAssignment({ datevPersonnelNumber: "1001", rowVersion: -1 }),
    /Mitarbeiterversion/
  );
});

// ---------------------------------------------------------------------------
// Der Rest braucht eine Datenbank.
// ---------------------------------------------------------------------------

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

const datenbank = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.API_DB_USER,
  password: process.env.API_DB_PASSWORD,
  max: 4
};

function anfrage(method, body) {
  const request = body === undefined
    ? Readable.from([])
    : Readable.from([Buffer.from(JSON.stringify(body), "utf8")]);
  request.method = method;
  request.headers = body === undefined ? {} : { "content-type": "application/json" };
  return request;
}

function aufrufen(pool, context, method, pfad, body) {
  return withTenantTransaction(pool, context, (client) => handleDatevRequest({
    request: anfrage(method, body),
    url: new URL(`http://intern${pfad}`),
    client,
    context
  }));
}

integrationTest("DATEV-Stammdaten, Lohnart-Zuordnung und Vorschau", async (t) => {
  const apiPool = createPool(datenbank);
  const ownerPool = createPool({
    ...datenbank,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });
  t.after(async () => {
    await apiPool.end();
    await ownerPool.end();
  });

  const kennung = String(Date.now()).slice(-5);
  const firma = (await ownerPool.query(
    `INSERT INTO companies (company_number, legal_name, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [`F-6${kennung}`, `DATEV-Test ${kennung} GmbH`, `DATEV-Test ${kennung}`]
  )).rows[0].id;

  const buero = (await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, 'Büro', 'DATEV-Test') RETURNING id`,
    [firma, `DV-BUERO-${kennung}`]
  )).rows[0].id;
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE company_id = $1 AND role_key = 'office'`,
    [firma, buero]
  );
  const buerokontext = { companyId: firma, userId: buero };

  const geschaeftsfuehrung = (await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, 'Geschäfts', 'Führung') RETURNING id`,
    [firma, `DV-GF-${kennung}`]
  )).rows[0].id;

  const monteur = (await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, 'Mika', 'Monteurin') RETURNING id`,
    [firma, `DV-MONT-${kennung}`]
  )).rows[0].id;
  await ownerPool.query(
    `INSERT INTO user_roles (company_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE company_id = $1 AND role_key = 'installer'`,
    [firma, monteur]
  );
  const monteurkontext = { companyId: firma, userId: monteur };

  await t.test("ein Monteur kommt an die DATEV-Verwaltung nicht heran", async () => {
    await assert.rejects(
      () => aufrufen(apiPool, monteurkontext, "GET", "/api/v1/admin/datev/settings"),
      (fehler) => {
        assert.equal(fehler.code, "datev_administration_forbidden");
        return true;
      }
    );
    await assert.rejects(
      () => aufrufen(apiPool, monteurkontext, "GET", "/api/v1/admin/datev/personnel-numbers"),
      (fehler) => {
        assert.equal(fehler.code, "datev_administration_forbidden");
        return true;
      }
    );
    await assert.rejects(
      () => aufrufen(
        apiPool, monteurkontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
        { datevPersonnelNumber: "1", rowVersion: 1 }
      ),
      (fehler) => {
        assert.equal(fehler.code, "datev_administration_forbidden");
        return true;
      }
    );
  });

  await t.test("ohne Stammdaten ist die Firma erkennbar nicht angebunden", async () => {
    const { body } = await aufrufen(apiPool, buerokontext, "GET", "/api/v1/admin/datev/settings");
    assert.equal(body.settings, null);
  });

  let stammdatenVersion;
  await t.test("die Stammdaten lassen sich anlegen und mit Versionsprüfung ändern", async () => {
    const angelegt = await aufrufen(apiPool, buerokontext, "PUT", "/api/v1/admin/datev/settings", {
      consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "lodas", rowVersion: 0
    });
    assert.equal(angelegt.status, 200);
    assert.equal(angelegt.body.settings.rowVersion, 1);

    await assert.rejects(
      () => aufrufen(apiPool, buerokontext, "PUT", "/api/v1/admin/datev/settings", {
        consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "lug", rowVersion: 0
      }),
      (fehler) => {
        assert.equal(fehler.code, "row_version_conflict");
        return true;
      }
    );

    const geaendert = await aufrufen(apiPool, buerokontext, "PUT", "/api/v1/admin/datev/settings", {
      consultantNumber: "1234567", clientNumber: "12345", payrollProduct: "lug", rowVersion: 1
    });
    assert.equal(geaendert.body.settings.payrollProduct, "lug");
    stammdatenVersion = geaendert.body.settings.rowVersion;
    assert.equal(stammdatenVersion, 2);
  });

  let ersteZuordnungReason;
  await t.test("eine korrigierte Zuordnung löst die bisherige ab, statt sie zu überschreiben", async () => {
    const erste = await aufrufen(apiPool, buerokontext, "POST", "/api/v1/admin/datev/wage-type-mappings", {
      category: "time_type", mappingKey: "work", wageTypeNumber: "1000", changeReason: "Ersteinrichtung"
    });
    assert.equal(erste.status, 201);
    assert.equal(erste.body.mapping.wageTypeNumber, "1000");
    assert.equal(erste.body.mapping.validUntil, null);
    ersteZuordnungReason = erste.body.mapping.id;

    const korrigiert = await aufrufen(apiPool, buerokontext, "POST", "/api/v1/admin/datev/wage-type-mappings", {
      category: "time_type", mappingKey: "work", wageTypeNumber: "1100", changeReason: "Kanzlei korrigiert"
    });
    assert.equal(korrigiert.body.mapping.wageTypeNumber, "1100");

    const aktuelle = await aufrufen(apiPool, buerokontext, "GET", "/api/v1/admin/datev/wage-type-mappings");
    assert.equal(aktuelle.body.mappings.length, 1, "Nur die gültige Zuordnung erscheint ohne includeHistory");
    assert.equal(aktuelle.body.mappings[0].wageTypeNumber, "1100");

    const mitHistorie = await aufrufen(
      apiPool, buerokontext, "GET", "/api/v1/admin/datev/wage-type-mappings?includeHistory=true"
    );
    assert.equal(mitHistorie.body.mappings.length, 2, "Die abgelöste Zeile bleibt als Historie sichtbar");
    const abgeloest = mitHistorie.body.mappings.find((zeile) => zeile.id === ersteZuordnungReason);
    assert.equal(abgeloest.wageTypeNumber, "1000", "Die abgelöste Zeile behält ihren ursprünglichen Wert");
    assert.notEqual(abgeloest.validUntil, null, "Die abgelöste Zeile trägt einen Ablösezeitpunkt");
  });

  // Eine zweite Monteurin ohne jede Buchung im Vorschauzeitraum - die braucht
  // die Vorschau unten, um zu belegen, dass eine fehlende DATEV-Personalnummer
  // ohne Zeile im Zeitraum nicht gemeldet wird.
  const unbeteiligt = (await ownerPool.query(
    `INSERT INTO users (company_id, personnel_number, first_name, last_name)
     VALUES ($1, $2, 'Unbeteiligte', 'Monteurin') RETURNING id`,
    [firma, `DV-UNBET-${kennung}`]
  )).rows[0].id;

  let monteurRowVersion;
  await t.test("DATEV-Personalnummern lassen sich setzen, ändern und wieder löschen", async () => {
    const liste = await aufrufen(apiPool, buerokontext, "GET", "/api/v1/admin/datev/personnel-numbers");
    assert.equal(liste.status, 200);
    const monteurEintrag = liste.body.employees.find((zeile) => zeile.employeeId === monteur);
    assert.ok(monteurEintrag, "Der aktive Monteur erscheint in der Liste");
    assert.equal(monteurEintrag.datevPersonnelNumber, null);
    monteurRowVersion = monteurEintrag.rowVersion;

    // Setzen.
    const gesetzt = await aufrufen(
      apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
      { datevPersonnelNumber: "2001", rowVersion: monteurRowVersion }
    );
    assert.equal(gesetzt.status, 200);
    assert.equal(gesetzt.body.employee.datevPersonnelNumber, "2001");
    monteurRowVersion = gesetzt.body.employee.rowVersion;

    // Führende Null, sechs Stellen und Buchstaben werden abgelehnt - das
    // prüft bereits die reine Validierung oben; hier zusätzlich, dass ein
    // solcher Versuch die Datenbank erst gar nicht erreicht (keine
    // Zwischenänderung, rowVersion bleibt unverändert).
    await assert.rejects(
      () => aufrufen(
        apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
        { datevPersonnelNumber: "0250", rowVersion: monteurRowVersion }
      ),
      /DATEV-Personalnummer/
    );

    // Falsche rowVersion.
    await assert.rejects(
      () => aufrufen(
        apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
        { datevPersonnelNumber: "2002", rowVersion: monteurRowVersion - 1 }
      ),
      (fehler) => {
        assert.equal(fehler.code, "row_version_conflict");
        return true;
      }
    );

    // Doppelt vergebene Nummer: die Meldung nennt, wer sie bereits hat.
    const zweiteVersion = (await aufrufen(
      apiPool, buerokontext, "GET", "/api/v1/admin/datev/personnel-numbers"
    )).body.employees.find((zeile) => zeile.employeeId === unbeteiligt).rowVersion;
    await assert.rejects(
      () => aufrufen(
        apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${unbeteiligt}`,
        { datevPersonnelNumber: "2001", rowVersion: zweiteVersion }
      ),
      (fehler) => {
        assert.equal(fehler.code, "datev_personnel_number_taken");
        assert.match(fehler.message, /Mika/);
        assert.match(fehler.message, new RegExp(`DV-MONT-${kennung}`));
        return true;
      }
    );

    // Löschen (auf null) - jemand hat sich vertan und macht es rückgängig.
    const geloescht = await aufrufen(
      apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
      { datevPersonnelNumber: null, rowVersion: monteurRowVersion }
    );
    assert.equal(geloescht.status, 200);
    assert.equal(geloescht.body.employee.datevPersonnelNumber, null);
    monteurRowVersion = geloescht.body.employee.rowVersion;

    // Nicht gefunden / nicht aktiv.
    await assert.rejects(
      () => aufrufen(
        apiPool, buerokontext, "PUT", "/api/v1/admin/datev/personnel-numbers/00000000-0000-4000-8000-000000000000",
        { datevPersonnelNumber: "3001", rowVersion: 1 }
      ),
      (fehler) => {
        assert.equal(fehler.code, "employee_not_found");
        return true;
      }
    );
  });

  const heute = "2026-09-07";
  await t.test("die Vorschau zeigt Stunden aus work_days und Tage aus genehmigten Abwesenheiten", async () => {
    await ownerPool.query(
      `INSERT INTO work_days (
         company_id, user_id, work_date, target_work_minutes, status,
         gross_minutes, break_minutes, work_minutes, travel_minutes, overtime_minutes
       ) VALUES ($1, $2, $3, 480, 'approved', 420, 0, 420, 30, 15)`,
      [firma, monteur, heute]
    );
    // office_review -> management_review -> approved: der Antrag durchläuft
    // dieselbe Zweipersonenfreigabe wie über die Oberfläche, kein
    // Direkteinstieg auf "approved" (Migration 033 erzwingt das per
    // Statusautomat und Formkontrolle).
    const antrag = (await ownerPool.query(
      `INSERT INTO absence_requests (
         company_id, user_id, absence_type, start_date, end_date, day_part, requested_by_user_id
       ) VALUES ($1, $2, 'sick', $3, $3, 'full_day', $2) RETURNING id`,
      [firma, monteur, heute]
    )).rows[0].id;
    await ownerPool.query(
      `UPDATE absence_requests
       SET status = 'management_review', office_reviewed_by_user_id = $2, office_reviewed_at = CURRENT_TIMESTAMP
       WHERE company_id = $1 AND id = $3`,
      [firma, buero, antrag]
    );
    await ownerPool.query(
      `UPDATE absence_requests
       SET status = 'approved', management_reviewed_by_user_id = $2, management_reviewed_at = CURRENT_TIMESTAMP
       WHERE company_id = $1 AND id = $3`,
      [firma, geschaeftsfuehrung, antrag]
    );

    const { body } = await aufrufen(
      apiPool, buerokontext, "GET", `/api/v1/admin/datev/export-preview?from=${heute}&to=${heute}`
    );
    assert.equal(body.settingsConfigured, true);
    assert.equal(body.payrollProduct, "lug");

    const arbeit = body.lines.find((zeile) => zeile.mappingKey === "work");
    assert.equal(arbeit.hours, 7);
    assert.equal(arbeit.wageTypeNumber, "1100");
    assert.equal(arbeit.mapped, true);
    assert.equal(
      arbeit.datevPersonnelNumber, null,
      "Die Zeile trägt die DATEV-Personalnummer des Mitarbeiters (hier: keine gepflegt)"
    );

    const fahrt = body.lines.find((zeile) => zeile.mappingKey === "travel");
    assert.equal(fahrt.hours, 0.5);
    assert.equal(fahrt.mapped, false, "Fahrzeit wurde in diesem Test nicht zugeordnet");

    const krankheit = body.lines.find((zeile) => zeile.mappingKey === "sick");
    assert.equal(krankheit.days, 1);
    assert.equal(krankheit.mapped, false, "Kein Ausfallschlüssel für Krankheit hinterlegt");

    assert.ok(
      body.missingMappings.some((eintrag) => eintrag.mappingKey === "sick" && eintrag.category === "absence_type"),
      "Die fehlende Zuordnung für Krankheit wird ausdrücklich gemeldet, nicht stillschweigend übersprungen"
    );
    assert.ok(
      body.missingMappings.some((eintrag) => eintrag.mappingKey === "travel"),
      "Auch eine fehlende Zeitart-Zuordnung wird gemeldet"
    );

    // Der wichtigste Teil dieser Prüfung: missingPersonnelNumbers nennt genau
    // die Mitarbeiter mit Zeilen im Zeitraum und ohne DATEV-Personalnummer -
    // nicht mehr, nicht weniger.
    assert.ok(
      body.missingPersonnelNumbers.some((eintrag) => eintrag.employeeId === monteur),
      "Der Monteur hat Zeilen im Zeitraum und keine DATEV-Personalnummer - er wird gemeldet"
    );
    assert.ok(
      !body.missingPersonnelNumbers.some((eintrag) => eintrag.employeeId === unbeteiligt),
      "Ein Mitarbeiter ohne Nummer, der im Zeitraum keine Zeile erzeugt, wird NICHT gemeldet"
    );
    assert.equal(
      body.missingPersonnelNumbers.length, 1,
      "Nur der tatsächlich betroffene Mitarbeiter erscheint, nicht der ganze Bestand"
    );

    // Wird die Nummer gepflegt, verschwindet die Meldung und die Zeilen
    // tragen sie.
    const aktuelleVersion = (await aufrufen(
      apiPool, buerokontext, "GET", "/api/v1/admin/datev/personnel-numbers"
    )).body.employees.find((zeile) => zeile.employeeId === monteur).rowVersion;
    await aufrufen(
      apiPool, buerokontext, "PUT", `/api/v1/admin/datev/personnel-numbers/${monteur}`,
      { datevPersonnelNumber: "3005", rowVersion: aktuelleVersion }
    );
    const erneuerteVorschau = (await aufrufen(
      apiPool, buerokontext, "GET", `/api/v1/admin/datev/export-preview?from=${heute}&to=${heute}`
    )).body;
    assert.ok(
      !erneuerteVorschau.missingPersonnelNumbers.some((eintrag) => eintrag.employeeId === monteur),
      "Nach dem Pflegen der Nummer wird der Mitarbeiter nicht mehr gemeldet"
    );
    assert.equal(
      erneuerteVorschau.lines.find((zeile) => zeile.mappingKey === "work").datevPersonnelNumber,
      "3005"
    );
  });
});
