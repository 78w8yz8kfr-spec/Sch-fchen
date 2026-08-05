import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { APPLICATION_VERSION, createApp } from "../src/app.mjs";
import { createPool } from "../src/database.mjs";
import { hashPassword } from "../src/password.mjs";

// Berichtsheft: Wochenbericht schreiben, einreichen, zurueckgeben, nachbessern,
// freigeben. Der Fall braucht einen Auszubildenden, einen Ausbilder und eine
// Firma, in der das Modul freigeschaltet ist - deshalb bringt dieser Test
// seine eigenen Daten mit und laeuft getrennt vom grossen Integrationstest.

const enabled = process.env.API_INTEGRATION_TEST === "true";
const integrationTest = enabled ? test : test.skip;

integrationTest("Berichtsheft: Wochenbericht von der Anlage bis zur Freigabe", async (t) => {
  const config = {
    port: 0,
    allowedOrigin: "http://localhost:4173",
    timeZone: "Europe/Berlin",
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    initialCompanyNumber: "F-000001",
    initialSetupToken: "CI-SETUP-TOKEN-2026-ONLY-TEST",
    platformSetupToken: "CI-PLATFORM-SETUP-2026-ONLY-TEST",
    staticDirectory: process.cwd(),
    database: {
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.API_DB_USER,
      password: process.env.API_DB_PASSWORD,
      max: 4
    }
  };
  const apiPool = createPool(config.database);
  const ownerPool = createPool({
    ...config.database,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  });
  const server = createServer(createApp({ pool: apiPool, config, logger: { error() {} } }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apiPool.end();
    await ownerPool.end();
  });

  const kennung = Date.now().toString(36).toUpperCase();
  const passwort = "Berichtsheft-Pruefung-2026!";
  const woche = "2026-03-02";

  const firma = await ownerPool.query(
    `INSERT INTO companies (legal_name, display_name)
     VALUES ($1, $2) RETURNING id, company_number`,
    [`Lehrbetrieb ${kennung} GmbH`, `Lehrbetrieb ${kennung}`]
  );
  const companyId = firma.rows[0].id;
  const companyNumber = firma.rows[0].company_number;

  const anlegen = async (personalnummer, vorname, nachname, rolle) => {
    const person = await ownerPool.query(
      `INSERT INTO users (company_id, personnel_number, first_name, last_name,
                          password_hash, must_change_password, status)
       VALUES ($1, $2, $3, $4, $5, FALSE, 'active') RETURNING id`,
      [companyId, personalnummer, vorname, nachname, await hashPassword(passwort)]
    );
    const rollenId = await ownerPool.query(
      "SELECT id FROM roles WHERE company_id = $1 AND role_key = $2 AND status = 'active'",
      [companyId, rolle]
    );
    assert.equal(rollenId.rowCount, 1, `Die Rolle ${rolle} muss vorhanden sein`);
    await ownerPool.query(
      `INSERT INTO user_roles (company_id, user_id, role_id, assigned_by_user_id, reason)
       VALUES ($1, $2, $3, $2, 'Testaufbau Berichtsheft')`,
      [companyId, person.rows[0].id, rollenId.rows[0].id]
    );
    return person.rows[0].id;
  };

  const azubiId = await anlegen(`AZUBI-${kennung}`, "Anna", "Auszubildende", "installer");
  const ausbilderId = await anlegen(`AUSB-${kennung}`, "Adam", "Ausbilder", "foreman");
  const fremdId = await anlegen(`MONT-${kennung}`, "Mara", "Montage", "installer");

  await ownerPool.query(
    "UPDATE users SET is_apprentice = TRUE, trainer_user_id = $2 WHERE id = $1",
    [azubiId, ausbilderId]
  );

  const anmelden = async (personalnummer) => {
    const antwort = await fetch(`${baseUrl}/api/v1/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: config.allowedOrigin,
        "X-Schaefchen-Version": APPLICATION_VERSION
      },
      body: JSON.stringify({ companyNumber, personnelNumber: personalnummer, password: passwort })
    });
    assert.equal(antwort.status, 201, await antwort.clone().text());
    return antwort.headers.get("set-cookie").split(";", 1)[0];
  };

  const azubiCookie = await anmelden(`AZUBI-${kennung}`);
  const ausbilderCookie = await anmelden(`AUSB-${kennung}`);
  const fremdCookie = await anmelden(`MONT-${kennung}`);

  const ruf = (pfad, cookie, optionen = {}) => fetch(`${baseUrl}${pfad}`, {
    ...optionen,
    headers: {
      "Content-Type": "application/json",
      Origin: config.allowedOrigin,
      "X-Schaefchen-Version": APPLICATION_VERSION,
      Cookie: cookie,
      ...(optionen.headers || {})
    }
  });

  // Ohne Freigabe der Plattform gibt es das Berichtsheft nicht. Es ist ein
  // eigener Bereich und gehoert nicht in den Grundumfang.
  const gesperrt = await ruf(`/api/v1/apprentice/reports?from=2026-01-01&to=2026-12-31`, azubiCookie);
  assert.equal(gesperrt.status, 409, await gesperrt.clone().text());
  assert.equal((await gesperrt.json()).error.code, "module_disabled");

  const modul = await ownerPool.query(
    "SELECT id FROM module_catalog WHERE module_key = 'apprentice_reports'"
  );
  await ownerPool.query(
    `INSERT INTO company_module_entitlements (
       company_id, module_id, entitlement_status, included_in_plan, change_reason
     ) VALUES ($1, $2, 'permanent', TRUE, 'Berichtsheft fuer den Abnahmetest freigeben')
     ON CONFLICT (company_id, module_id) DO UPDATE SET entitlement_status = 'permanent'`,
    [companyId, modul.rows[0].id]
  );

  // Wer kein Berichtsheft fuehrt, hat hier nichts zu suchen.
  const fremdeSicht = await ruf(`/api/v1/apprentice/reports?from=2026-01-01&to=2026-12-31`, fremdCookie);
  assert.equal(fremdeSicht.status, 403, await fremdeSicht.clone().text());
  assert.equal((await fremdeSicht.json()).error.code, "not_an_apprentice");

  // Eine Woche beginnt am Montag.
  const falscheWoche = await ruf(`/api/v1/apprentice/reports/2026-03-03`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({ companySummary: "Mitten in der Woche" })
  });
  assert.equal(falscheWoche.status, 400, await falscheWoche.clone().text());

  // Einreichen ohne Bericht geht nicht.
  const leer = await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, { method: "POST" });
  assert.equal(leer.status, 404, await leer.clone().text());

  const entwurf = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      companySummary: "Unterverteilung verdrahtet und geprüft",
      absenceNote: "Freitag Berufsschule"
    })
  });
  assert.equal(entwurf.status, 200, await entwurf.clone().text());
  const entwurfBody = (await entwurf.json()).report;
  assert.equal(entwurfBody.status, "draft");
  assert.equal(entwurfBody.weekStart, woche);

  // Die Arbeitszeit kommt aus der Zeiterfassung, nicht aus der Eingabe.
  await ownerPool.query(
    `INSERT INTO work_days (
       company_id, user_id, work_date, target_work_minutes,
       gross_minutes, break_minutes, work_minutes
     ) VALUES ($1, $2, $3::DATE, 480, 495, 30, 465),
              ($1, $2, $3::DATE + 1, 480, 500, 30, 470)`,
    [companyId, azubiId, woche]
  );

  const eingereicht = await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, {
    method: "POST"
  });
  assert.equal(eingereicht.status, 200, await eingereicht.clone().text());
  const eingereichtBody = (await eingereicht.json()).report;
  assert.equal(eingereichtBody.status, "submitted");
  assert.equal(eingereichtBody.workedMinutes, 935);
  assert.equal(eingereichtBody.apprenticeSignatureName, "Anna Auszubildende");

  // Nach dem Einreichen schreibt der Azubi nicht weiter.
  const nachtraeglich = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({ companySummary: "Nachträglich geändert" })
  });
  assert.equal(nachtraeglich.status, 409, await nachtraeglich.clone().text());
  assert.equal((await nachtraeglich.json()).error.code, "apprentice_report_locked");

  // Ein Monteur ohne Auszubildende darf nicht pruefen.
  const fremdePruefung = await ruf("/api/v1/admin/apprentice-reports", fremdCookie);
  assert.equal(fremdePruefung.status, 403, await fremdePruefung.clone().text());
  assert.equal((await fremdePruefung.json()).error.code, "apprentice_review_forbidden");

  // Der Ausbilder sieht seinen Auszubildenden, obwohl er keine Planungsrolle hat.
  const liste = await ruf("/api/v1/admin/apprentice-reports", ausbilderCookie);
  assert.equal(liste.status, 200, await liste.clone().text());
  const offene = (await liste.json()).reports;
  assert.equal(offene.length, 1);
  assert.equal(offene[0].apprenticeName, "Anna Auszubildende");
  const berichtId = offene[0].id;

  // Eine Rueckgabe ohne Bemerkung waere fuer den Azubi wertlos.
  const ohneBemerkung = await ruf("/api/v1/admin/apprentice-reports/review", ausbilderCookie, {
    method: "POST",
    body: JSON.stringify({ reportIds: [berichtId], decision: "returned" })
  });
  assert.equal(ohneBemerkung.status, 400, await ohneBemerkung.clone().text());

  const zurueck = await ruf("/api/v1/admin/apprentice-reports/review", ausbilderCookie, {
    method: "POST",
    body: JSON.stringify({
      reportIds: [berichtId],
      decision: "returned",
      comment: "Bitte die Berufsschule ergänzen"
    })
  });
  assert.equal(zurueck.status, 200, await zurueck.clone().text());
  assert.equal((await zurueck.json()).reports[0].status, "returned");

  // Zurueckgegeben heisst: der Azubi darf wieder schreiben.
  const nachgebessert = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      companySummary: "Unterverteilung verdrahtet und geprüft",
      schoolSummary: "Grundlagen der Messtechnik"
    })
  });
  assert.equal(nachgebessert.status, 200, await nachgebessert.clone().text());
  assert.equal((await nachgebessert.json()).report.status, "draft");

  await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, { method: "POST" });

  const freigabe = await ruf("/api/v1/admin/apprentice-reports/review", ausbilderCookie, {
    method: "POST",
    body: JSON.stringify({ reportIds: [berichtId], decision: "approved" })
  });
  assert.equal(freigabe.status, 200, await freigabe.clone().text());
  const freigegeben = (await freigabe.json()).reports[0];
  assert.equal(freigegeben.status, "approved");
  assert.equal(freigegeben.trainerSignatureName, "Adam Ausbilder");

  // Ein freigegebener Nachweis ist unveraenderlich - auch fuer den Ausbilder.
  const nochmal = await ruf("/api/v1/admin/apprentice-reports/review", ausbilderCookie, {
    method: "POST",
    body: JSON.stringify({ reportIds: [berichtId], decision: "returned", comment: "Doch nicht" })
  });
  assert.equal(nochmal.status, 409, await nochmal.clone().text());
  assert.equal((await nochmal.json()).error.code, "apprentice_report_not_submitted");

  // Der Verlauf hat jeden Schritt behalten.
  const verlauf = await ownerPool.query(
    "SELECT status FROM apprentice_report_events WHERE report_id = $1 ORDER BY report_row_version",
    [berichtId]
  );
  assert.deepEqual(
    verlauf.rows.map((zeile) => zeile.status),
    ["draft", "submitted", "returned", "draft", "submitted", "approved"]
  );

  // Mandantentrennung: die Nachbarfirma sieht den Bericht nicht.
  const nachbar = await ownerPool.query(
    `INSERT INTO companies (legal_name, display_name) VALUES ($1, $2) RETURNING id, company_number`,
    [`Nachbarbetrieb ${kennung} GmbH`, `Nachbarbetrieb ${kennung}`]
  );
  const fremdeFirma = await ownerPool.query(
    `SELECT COUNT(*)::INTEGER AS anzahl FROM apprentice_reports WHERE company_id = $1`,
    [nachbar.rows[0].id]
  );
  assert.equal(fremdeFirma.rows[0].anzahl, 0);
});
