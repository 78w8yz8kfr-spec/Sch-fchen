// Notfallweg: Passwort setzen, wenn niemand mehr in die Software kommt.
//
// WOFUER DAS GEDACHT IST
//
// Der uebliche Weg ist das Zuruecksetzen durch das Buero in der Verwaltung.
// Genau ein Fall bleibt uebrig, den die Anwendung selbst nicht loesen kann:
// Es gibt niemanden mehr, der sich anmelden koennte - die einzige
// Administration hat ihr Passwort vergessen. Dann hilft nur noch jemand mit
// Zugang zur Datenbank.
//
// Das Werkzeug schreibt NICHTS in die Datenbank. Es druckt den SQL-Befehl,
// den jemand mit Datenbankzugang bewusst ausfuehrt. Das ist Absicht: Ein
// Programm, das ohne Rueckfrage Passwoerter ueberschreibt, ist eine
// Hintertuer. Ein Text, den ein Mensch liest, bevor er ihn ausfuehrt, ist
// eine Notfallanleitung.
//
// AUFRUF
//
//   printf '%s' 'MeinNeuesPasswort1' \
//     | node scripts/notfall-passwort.mjs F-000001 1
//
// Das Passwort kommt ueber die Standardeingabe, nie als Argument - Argumente
// stehen in der Prozessliste und in der Shell-Historie.

import { stdin, stdout, argv } from "node:process";
import { hashPassword } from "../src/password.mjs";

const [firmennummer, personalnummer] = argv.slice(2);

if (!firmennummer || !personalnummer) {
  console.error("Aufruf: printf '%s' 'PASSWORT' | node scripts/notfall-passwort.mjs <Firmennummer> <Personalnummer>");
  process.exit(1);
}

if (stdin.isTTY) {
  console.error("Passwort über die Standardeingabe übergeben, nicht als Kommandozeilenargument.");
  process.exit(1);
}

let passwort = "";
stdin.setEncoding("utf8");
for await (const teil of stdin) passwort += teil;
passwort = passwort.replace(/[\r\n]+$/, "");

// Dieselbe Regel wie in validation.mjs. Lieber hier scheitern als einen
// Datensatz zu erzeugen, an dem sich die Anwendung spaeter stoert.
if (!/[a-zäöü]/i.test(passwort) || !/\d/.test(passwort)) {
  console.error("Das Passwort benötigt mindestens einen Buchstaben und eine Zahl.");
  process.exit(1);
}

const hash = await hashPassword(passwort);

// SQL-Zeichenkette: einfache Anfuehrungszeichen werden verdoppelt. Der Hash
// selbst enthaelt nur Zeichen aus [A-Za-z0-9_$-], aber Firmen- und
// Personalnummer kommen von aussen.
const sqlText = (wert) => `'${String(wert).replace(/'/g, "''")}'`;

stdout.write(`-- Notfall-Passwort für Firma ${firmennummer}, Personalnummer ${personalnummer}
-- Erzeugt am ${new Date().toISOString()}
--
-- Vor dem Ausführen prüfen: Ist das die richtige Firma und die richtige
-- Person? Der Befehl überschreibt ein Passwort und meldet die Person auf
-- allen Geräten ab.
BEGIN;

-- Warum "must_change_password = TRUE": Wer diesen Weg geht, kennt das
-- Passwort im Klartext. Die Anwendung verlangt beim nächsten Anmelden ein
-- neues, das nur die Person selbst kennt.
--
-- Warum "failed_login_attempts" und "locked_until": Migration 044 sperrt ein
-- Konto nach zehn Fehlversuchen. Genau wer sein Passwort vergessen hat, hat
-- es vorher mehrfach falsch probiert. Ohne diese beiden Spalten wäre das
-- Passwort neu und das Konto trotzdem zu.
UPDATE users
SET password_hash = ${sqlText(hash)},
    must_change_password = TRUE,
    password_changed_at = CURRENT_TIMESTAMP,
    failed_login_attempts = 0,
    locked_until = NULL
WHERE company_id = (SELECT id FROM companies WHERE company_number = ${sqlText(firmennummer)})
  AND personnel_number = ${sqlText(personalnummer)}
  AND status = 'active';

-- Offene Sitzungen beenden: Wenn jemand anderes das Konto benutzt hat, endet
-- der Zugriff hier und nicht erst, wenn die Sitzung von allein abläuft.
UPDATE user_sessions
SET revoked_at = CURRENT_TIMESTAMP,
    revocation_reason = 'notfall_passwort'
WHERE revoked_at IS NULL
  AND company_id = (SELECT id FROM companies WHERE company_number = ${sqlText(firmennummer)})
  AND user_id = (
    SELECT id FROM users
    WHERE company_id = (SELECT id FROM companies WHERE company_number = ${sqlText(firmennummer)})
      AND personnel_number = ${sqlText(personalnummer)}
  );

-- Zur Kontrolle vor dem COMMIT: Es muss genau eine Zeile erscheinen, und
-- "must_change_password" muss "t" sein. Erscheint keine Zeile, stimmt die
-- Firmen- oder Personalnummer nicht - dann ROLLBACK statt COMMIT.
SELECT personnel_number, first_name, last_name, must_change_password, locked_until
FROM users
WHERE company_id = (SELECT id FROM companies WHERE company_number = ${sqlText(firmennummer)})
  AND personnel_number = ${sqlText(personalnummer)};

COMMIT;
`);
