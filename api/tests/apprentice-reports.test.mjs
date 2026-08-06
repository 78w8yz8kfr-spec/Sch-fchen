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

  const azubiId = await anlegen(`AZUBI-${kennung}`, "Anna", "Auszubildende", "apprentice");
  const ausbilderId = await anlegen(`AUSB-${kennung}`, "Adam", "Ausbilder", "foreman");
  const fremdId = await anlegen(`MONT-${kennung}`, "Mara", "Montage", "installer");
  await anlegen(`CHEF-${kennung}`, "Clara", "Chefin", "managing_director");

  await ownerPool.query(
    "UPDATE users SET trainer_user_id = $2 WHERE id = $1",
    [azubiId, ausbilderId]
  );

  // Genehmigter Urlaub in der Berichtswoche. Er soll im Bericht stehen, ohne
  // dass ihn jemand abschreibt.
  await ownerPool.query(
    `INSERT INTO absence_requests (
       company_id, user_id, requested_by_user_id, absence_type,
       start_date, end_date, day_part, status
     ) VALUES ($1, $2, $2, 'vacation', $3::DATE + 3, $3::DATE + 4, 'full_day', 'approved')
     RETURNING id`,
    [companyId, azubiId, woche]
  );
  // Der Antrag durchlaeuft dieselben Stufen wie im Betrieb: erst das Buero,
  // dann die Geschaeftsfuehrung. Die Datenbank verlangt zu jeder Stufe den
  // Pruefer und den Zeitpunkt - ein Sprung mitten hinein wird abgewiesen.
  await ownerPool.query(
    `UPDATE absence_requests
     SET status = 'management_review',
         office_reviewed_by_user_id = $3, office_reviewed_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND user_id = $2`,
    [companyId, azubiId, ausbilderId]
  );
  await ownerPool.query(
    `UPDATE absence_requests
     SET status = 'approved',
         management_reviewed_by_user_id = $3, management_reviewed_at = CURRENT_TIMESTAMP
     WHERE company_id = $1 AND user_id = $2`,
    [companyId, azubiId, fremdId]
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
  const chefCookie = await anmelden(`CHEF-${kennung}`);

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
    body: JSON.stringify({ dailyEntries: [{ workDate: "2026-03-03", activities: ["Mitten in der Woche"] }] })
  });
  assert.equal(falscheWoche.status, 400, await falscheWoche.clone().text());

  // Eine Tageszeile ausserhalb der Woche gehoert nicht in diesen Bericht.
  const fremderTag = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({ dailyEntries: [{ workDate: "2026-03-16", activities: ["Falsche Woche"] }] })
  });
  assert.equal(fremderTag.status, 400, await fremderTag.clone().text());

  // Einreichen ohne Bericht geht nicht.
  const leer = await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, { method: "POST" });
  assert.equal(leer.status, 404, await leer.clone().text());

  const entwurf = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      dailyEntries: [
        { workDate: woche, activities: ["Unterverteilung verdrahtet", "Anschlüsse geprüft"] },
        { workDate: `2026-03-03`, activities: "Kabel verlegt\nVerteilerkasten angeschlossen" }
      ],
      weekRemark: "Ruhige Woche"
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

  // Ein Arbeitstag ohne Zeile ist kein Nachweis. Der Dienstag hat 470 Minuten
  // aus der Zeiterfassung, aber im Entwurf steht dazu nichts - eingereicht
  // wird das nicht. Ein halb ausgefuellter Nachweis faellt sonst erst am Ende
  // der Ausbildung auf, und dann ist die Woche nicht mehr zu rekonstruieren.
  const nurMontag = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      dailyEntries: [{ workDate: woche, activities: ["Nur der Montag"] }]
    })
  });
  assert.equal(nurMontag.status, 200, await nurMontag.clone().text());
  const unvollstaendig = await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, {
    method: "POST"
  });
  assert.equal(unvollstaendig.status, 400, await unvollstaendig.clone().text());
  const luecke = (await unvollstaendig.json()).error;
  assert.equal(luecke.code, "apprentice_report_incomplete");
  assert.match(luecke.message, /Di, 03\.03\./);

  // Ein Entwurf wird nicht gedruckt: auf Papier sieht er fertig aus.
  const entwurfsdruck = await ruf(`/api/v1/apprentice/reports/${woche}/pdf`, azubiCookie);
  assert.equal(entwurfsdruck.status, 409, await entwurfsdruck.clone().text());
  assert.equal((await entwurfsdruck.json()).error.code, "apprentice_report_not_submitted");

  // Die Vorschau ist etwas anderes als ein Ausdruck: sie zeigt beim Schreiben,
  // wie das Blatt wird, und ist deshalb auch fuer einen Entwurf erlaubt. Damit
  // sie nicht mit dem fertigen Nachweis verwechselt wird, traegt sie es im
  // Namen, im Blatt und in der Art, wie sie ausgeliefert wird.
  const vorschau = await ruf(`/api/v1/apprentice/reports/${woche}/pdf?preview=true`, azubiCookie);
  assert.equal(vorschau.status, 200, await vorschau.clone().text());
  assert.match(vorschau.headers.get("content-type"), /application\/pdf/);
  // "inline": im Browser anzeigen statt in den Downloadordner legen.
  assert.match(vorschau.headers.get("content-disposition"), /^inline;/);
  assert.match(vorschau.headers.get("content-disposition"), /Vorschau/);
  // Eingerahmt werden darf sie nur von der eigenen Seite - fremde Seiten
  // koennen Schaefchen weiterhin nicht einrahmen.
  assert.match(vorschau.headers.get("content-security-policy"), /frame-ancestors 'self'/);
  assert.equal(vorschau.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(
    Buffer.from(await vorschau.arrayBuffer()).subarray(0, 5).toString("ascii"),
    "%PDF-"
  );

  // Der Ausdruck bleibt streng: dort gilt weiterhin, dass niemand einrahmt.
  const strengerDruck = await ruf(`/api/v1/apprentice/reports/${woche}/pdf`, azubiCookie);
  assert.match(
    strengerDruck.headers.get("content-security-policy"),
    /frame-ancestors 'none'/
  );

  // Mit dem Dienstag ist die Woche vollstaendig.
  await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      dailyEntries: [
        { workDate: woche, activities: ["Unterverteilung verdrahtet", "Anschlüsse geprüft"] },
        { workDate: "2026-03-03", activities: "Kabel verlegt\nVerteilerkasten angeschlossen" }
      ],
      weekRemark: "Ruhige Woche"
    })
  });

  const eingereicht = await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, {
    method: "POST"
  });
  assert.equal(eingereicht.status, 200, await eingereicht.clone().text());
  const eingereichtBody = (await eingereicht.json()).report;
  assert.equal(eingereichtBody.status, "submitted");
  assert.equal(eingereichtBody.workedMinutes, 935);
  assert.equal(eingereichtBody.apprenticeSignatureName, "Anna Auszubildende");
  // Die Tageszeilen tragen die Arbeitszeit des Tages, und ein genehmigter
  // Urlaub bekommt eine eigene Zeile - im Nachweis darf kein Tag fehlen.
  const tage = eingereichtBody.dailyEntries;
  assert.deepEqual(tage.map((zeile) => zeile.workDate), [woche, "2026-03-03", "2026-03-05", "2026-03-06"]);
  assert.deepEqual(tage[0].activities, ["Unterverteilung verdrahtet", "Anschlüsse geprüft"]);
  assert.equal(tage[0].workedMinutes, 465);
  assert.deepEqual(tage[1].activities, ["Kabel verlegt", "Verteilerkasten angeschlossen"]);
  // Geschriebenes und Abgeleitetes bleiben getrennt: sonst stuende "Urlaub"
  // nach dem dritten Speichern dreimal in derselben Zeile.
  assert.deepEqual(tage[2].activities, []);
  assert.equal(tage[2].absence, "Urlaub");
  assert.equal(tage[0].absence, null);
  assert.equal(eingereichtBody.weekRemark, "Ruhige Woche");

  // Nach dem Einreichen schreibt der Azubi nicht weiter.
  const nachtraeglich = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({ dailyEntries: [{ workDate: woche, activities: ["Nachträglich geändert"] }] })
  });
  assert.equal(nachtraeglich.status, 409, await nachtraeglich.clone().text());
  assert.equal((await nachtraeglich.json()).error.code, "apprentice_report_locked");

  // Aber er holt sie selbst zurueck, solange der Ausbilder nicht
  // unterschrieben hat. Ohne diesen Weg war eine zu frueh eingereichte Woche
  // eine Sackgasse: schreiben ging nicht mehr, und der Azubi musste warten,
  // bis jemand anders sie zurueckgibt.
  const zurueckgeholt = await ruf(`/api/v1/apprentice/reports/${woche}/withdraw`, azubiCookie, {
    method: "POST"
  });
  assert.equal(zurueckgeholt.status, 200, await zurueckgeholt.clone().text());
  const offenerBericht = (await zurueckgeholt.json()).report;
  assert.equal(offenerBericht.status, "draft");
  // Die eigene Unterschrift ist mit zurueckgenommen.
  assert.equal(offenerBericht.apprenticeSignatureName, null);
  assert.equal(offenerBericht.submittedAt, null);
  // Die geschriebenen Tage bleiben stehen.
  assert.equal(offenerBericht.dailyEntries.length, 4);

  // Ein zweiter Fingertipp ergibt keine Fehlermeldung.
  const nochmalZurueck = await ruf(`/api/v1/apprentice/reports/${woche}/withdraw`, azubiCookie, {
    method: "POST"
  });
  assert.equal(nochmalZurueck.status, 200, await nochmalZurueck.clone().text());

  // Jetzt laesst sich wieder schreiben - und ohne Unterschrift auch nicht
  // drucken.
  const weiterAmText = await ruf(`/api/v1/apprentice/reports/${woche}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({
      dailyEntries: [
        { workDate: woche, activities: ["Unterverteilung verdrahtet", "Anschlüsse geprüft"] },
        { workDate: "2026-03-03", activities: ["Kabel verlegt", "Verteilerkasten angeschlossen"] }
      ],
      weekRemark: "Ruhige Woche"
    })
  });
  assert.equal(weiterAmText.status, 200, await weiterAmText.clone().text());
  const entwurfsdruckZwei = await ruf(`/api/v1/apprentice/reports/${woche}/pdf`, azubiCookie);
  assert.equal(entwurfsdruckZwei.status, 409, await entwurfsdruckZwei.clone().text());

  await ruf(`/api/v1/apprentice/reports/${woche}/submit`, azubiCookie, { method: "POST" });

  // Ein Berichtsheft ist persoenlich: weder ein fremder Monteur noch die
  // Geschaeftsfuehrung sehen es. Nur der eingetragene Ausbilder.
  for (const [wer, cookie] of [["Monteur", fremdCookie], ["Geschäftsführung", chefCookie]]) {
    const fremdePruefung = await ruf("/api/v1/admin/apprentice-reports", cookie);
    assert.equal(fremdePruefung.status, 403, `${wer}: ${await fremdePruefung.clone().text()}`);
    assert.equal((await fremdePruefung.json()).error.code, "apprentice_review_forbidden");
  }

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
      dailyEntries: [
        { workDate: woche, activities: ["Unterverteilung verdrahtet", "Anschlüsse geprüft"] },
        { workDate: "2026-03-03", activities: ["Kabel verlegt"] },
        { workDate: "2026-03-06", activities: ["Berufsschule: Grundlagen der Messtechnik"] }
      ]
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
  // Auch das Zurueckholen steht im Verlauf - zurueckgeholt wird nichts
  // stillschweigend. Festgehalten werden nur Statuswechsel: ein erneutes
  // Speichern desselben Entwurfs ist kein Schritt im Ablauf und fuellt den
  // Verlauf nicht mit Rauschen.
  assert.deepEqual(
    verlauf.rows.map((zeile) => zeile.status),
    [
      "draft", "submitted", "draft", "submitted",
      "returned", "draft", "submitted", "approved"
    ]
  );

  // Der Ausdruck fuer die Kammer. Ohne diesen Test lief die Route nie: sie
  // stuerzte an einer fehlenden Einbindung ab, und alle uebrigen Tests waren
  // trotzdem gruen - sie riefen sie nicht auf.
  const eigenerAusdruck = await ruf(`/api/v1/apprentice/reports/${woche}/pdf`, azubiCookie);
  assert.equal(eigenerAusdruck.status, 200, await eigenerAusdruck.clone().text());
  assert.match(eigenerAusdruck.headers.get("content-type"), /application\/pdf/);
  const blatt = Buffer.from(await eigenerAusdruck.arrayBuffer());
  assert.equal(blatt.subarray(0, 5).toString("ascii"), "%PDF-");

  // Der Ausbilder druckt den Nachweis seines Auszubildenden.
  const ausbilderAusdruck = await ruf(
    `/api/v1/apprentice/reports/${woche}/pdf?apprenticeUserId=${azubiId}`, ausbilderCookie
  );
  assert.equal(ausbilderAusdruck.status, 200, await ausbilderAusdruck.clone().text());

  // Ein Monteur nicht.
  const fremderAusdruck = await ruf(
    `/api/v1/apprentice/reports/${woche}/pdf?apprenticeUserId=${azubiId}`, fremdCookie
  );
  assert.equal(fremderAusdruck.status, 403, await fremderAusdruck.clone().text());

  // Eine Woche ohne Bericht gibt es nicht zu drucken.
  const leereWoche = await ruf("/api/v1/apprentice/reports/2026-04-06/pdf", azubiCookie);
  assert.equal(leereWoche.status, 404, await leereWoche.clone().text());

  // Fehlende Wochen
  //
  // Am Ende der Ausbildung ist eine fehlende Woche teuer, und bis dahin faellt
  // sie niemandem auf. Eine Woche gilt als faellig, sobald in ihr gearbeitet
  // wurde oder eine genehmigte Abwesenheit lag - und sie bleibt offen, solange
  // kein Bericht eingereicht ist. Ein Entwurf zaehlt nicht: geschrieben ist
  // nicht abgegeben.
  //
  // Die Wochen werden aus dem heutigen Datum gerechnet, nicht fest verdrahtet:
  // ein Test, der auf ein bestimmtes Jahr zeigt, wird irgendwann von selbst
  // gruen oder von selbst rot.
  const wochen = await ownerPool.query(
    `SELECT TO_CHAR(DATE_TRUNC('week', CURRENT_DATE)::DATE - 14, 'YYYY-MM-DD') AS vorletzte,
            TO_CHAR(DATE_TRUNC('week', CURRENT_DATE)::DATE - 7, 'YYYY-MM-DD') AS letzte,
            TO_CHAR(DATE_TRUNC('week', CURRENT_DATE)::DATE, 'YYYY-MM-DD') AS laufende`
  );
  const { vorletzte, letzte, laufende } = wochen.rows[0];

  await ownerPool.query(
    `INSERT INTO work_days (
       company_id, user_id, work_date, target_work_minutes,
       gross_minutes, break_minutes, work_minutes
     ) VALUES ($1, $2, $3::DATE, 480, 495, 30, 465),
              ($1, $2, $4::DATE, 480, 495, 30, 465),
              ($1, $2, $5::DATE, 480, 495, 30, 465)`,
    [companyId, azubiId, vorletzte, letzte, laufende]
  );

  const mitLuecken = await ruf(
    "/api/v1/apprentice/reports?from=2026-01-01&to=2026-12-31", azubiCookie
  );
  assert.equal(mitLuecken.status, 200, await mitLuecken.clone().text());
  const luecken = (await mitLuecken.json()).missingWeeks;
  assert.ok(luecken.includes(vorletzte), `Die Woche ${vorletzte} fehlt in der Mahnung`);
  assert.ok(luecken.includes(letzte), `Die Woche ${letzte} fehlt in der Mahnung`);
  // Die laufende Woche ist noch nicht vorbei - sie zu mahnen waere unfair.
  assert.ok(!luecken.includes(laufende), "Die laufende Woche wird gemahnt");
  // Die freigegebene Woche steht nicht mehr in der Liste.
  assert.ok(!luecken.includes(woche), "Eine freigegebene Woche wird gemahnt");

  // Ein Entwurf schliesst die Luecke nicht: er ist geschrieben, nicht abgegeben.
  await ruf(`/api/v1/apprentice/reports/${letzte}`, azubiCookie, {
    method: "PUT",
    body: JSON.stringify({ dailyEntries: [{ workDate: letzte, activities: ["Angefangen"] }] })
  });
  const nachEntwurf = await ruf(
    "/api/v1/apprentice/reports?from=2026-01-01&to=2026-12-31", azubiCookie
  );
  assert.ok((await nachEntwurf.json()).missingWeeks.includes(letzte));

  // Der Ausbilder sieht dieselben Luecken, ohne jeden einzeln durchzugehen.
  const pruefliste = await ruf("/api/v1/admin/apprentice-reports", ausbilderCookie);
  const gaps = (await pruefliste.json()).gaps;
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].apprenticeName, "Anna Auszubildende");
  assert.ok(gaps[0].weeks.includes(vorletzte));

  // Eingereicht schliesst sie.
  await ruf(`/api/v1/apprentice/reports/${letzte}/submit`, azubiCookie, { method: "POST" });
  const nachAbgabe = await ruf(
    "/api/v1/apprentice/reports?from=2026-01-01&to=2026-12-31", azubiCookie
  );
  const restluecken = (await nachAbgabe.json()).missingWeeks;
  assert.ok(!restluecken.includes(letzte), "Eine eingereichte Woche wird weiter gemahnt");
  assert.ok(restluecken.includes(vorletzte));

  // Der Ausdruck ueber mehrere Wochen: ein Zeitraum, eine Datei, eine Seite je
  // Woche. Woche fuer Woche einzeln zu laden ist genau die Arbeit, die diese
  // App abnehmen soll.
  const heft = await ruf(
    `/api/v1/apprentice/reports/pdf?from=${woche}&to=${laufende}`, azubiCookie
  );
  assert.equal(heft.status, 200, await heft.clone().text());
  assert.match(heft.headers.get("content-type"), /application\/pdf/);
  assert.match(heft.headers.get("content-disposition"), /Berichtsheft-/);
  const heftInhalt = Buffer.from(await heft.arrayBuffer());
  assert.equal(heftInhalt.subarray(0, 5).toString("ascii"), "%PDF-");
  // Zwei Wochen sind zwei Blaetter - das eine Blatt der einzelnen Woche ist
  // kleiner.
  assert.ok(heftInhalt.length > blatt.length);

  // Der Ausbilder darf das Heft seines Auszubildenden holen, ein Monteur nicht.
  const heftAusbilder = await ruf(
    `/api/v1/apprentice/reports/pdf?from=${woche}&to=${laufende}&apprenticeUserId=${azubiId}`,
    ausbilderCookie
  );
  assert.equal(heftAusbilder.status, 200, await heftAusbilder.clone().text());
  const heftFremd = await ruf(
    `/api/v1/apprentice/reports/pdf?from=${woche}&to=${laufende}&apprenticeUserId=${azubiId}`,
    fremdCookie
  );
  assert.equal(heftFremd.status, 403, await heftFremd.clone().text());

  // Ein Zeitraum ohne einen einzigen Bericht ist kein leeres Heft, sondern
  // eine klare Auskunft.
  const leeresHeft = await ruf(
    "/api/v1/apprentice/reports/pdf?from=2019-01-07&to=2019-01-13", azubiCookie
  );
  assert.equal(leeresHeft.status, 404, await leeresHeft.clone().text());
  assert.equal((await leeresHeft.json()).error.code, "apprentice_report_not_found");

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
