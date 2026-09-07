-- Fassung 0.44.41 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Nacharbeit aus einer Sicherheitsdurchsicht.
--
-- WAS GEPRUEFT WURDE
--
-- Der Betreiber wollte wissen, ob Zugangsdaten im Browser liegen und ob der
-- Anmelde-Endpunkt gegen die ueblichen Schwaechen abgesichert ist.
--
-- Beides ist geprueft und beides ist sauber. Im ausgelieferten Frontend
-- steht kein Schluessel, kein Passwort und kein Sitzungsmerkmal;
-- `document.cookie` kommt dort kein einziges Mal vor, das HttpOnly-Cookie
-- bleibt fuer JavaScript also tatsaechlich unsichtbar. Der Dienst-Worker
-- nimmt `/api/`-Antworten ausdruecklich von seinem Zwischenspeicher aus.
-- Ueber alle 250 Commits des Verlaufs wurde nie eine `.env`, ein Schluessel
-- oder ein Zertifikat eingecheckt.
--
-- Der Anmelde-Endpunkt haelt allen zehn geprueften Punkten stand: scrypt mit
-- Kostenparameter 16384, Vergleich ueber timingSafeEqual, ein neues
-- Sitzungsmerkmal je Anmeldung, gehasht gespeichert, HttpOnly mit
-- SameSite=Strict und Secure in Produktion, Herkunftspruefung vor jedem
-- Routing statt nur beim Anmelden, durchgaengig parametrisierte Abfragen,
-- und ein Abmelden, das die Sitzung serverseitig widerruft statt nur das
-- Cookie zu loeschen.
--
-- Besonders erwaehnenswert: bei unbekanntem Konto laeuft die Passwortpruefung
-- trotzdem, gegen einen Platzhalter-Hash mit denselben Kostenparametern. Ohne
-- das verriete die Antwortzeit, ob es ein Konto gibt - der uebliche Weg, eine
-- Kontenliste zu erraten, ohne je ein Passwort zu treffen.
--
-- WAS GEAENDERT WURDE
--
-- Zwei Luecken, die keine Lecks waren, aber welche haetten werden koennen.
--
-- Berichtsentwuerfe ueberlebten das Abmelden. Sie verschwanden nur beim
-- Absenden oder beim ausdruecklichen Verwerfen. Auf einem geteilten
-- Baustellengeraet blieb damit ein halbfertiger Bautagesbericht samt
-- Personal-Einsatzzeiten im lokalen Speicher liegen - unsichtbar in der
-- Oberflaeche, lesbar im Browserspeicher. Beim Abmelden weichen jetzt die
-- Entwuerfe des abgemeldeten Nutzers. Bewusst nur seine: ein Entwurf ist
-- oft die einzige Fassung eines noch nicht abgesendeten Berichts, und die
-- unfertige Arbeit eines Kollegen mitzureissen waere schlimmer als das
-- Problem.
--
-- Und `.dockerignore` schuetzte nur das Wurzelverzeichnis. Dort stand `.env`
-- ohne `**/`, waehrend `.gitignore` es rekursiv abdeckt. Das Produktionsimage
-- kopiert `frontend` und `deploy` vollstaendig - eine dort abgelegte
-- `.env` waere mitgekommen. Es lag keine da; genau deshalb war es der
-- richtige Zeitpunkt.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v123).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.41', 'superseded', CURRENT_TIMESTAMP,
    'Sicherheitsdurchsicht: keine Zugangsdaten im Browser, keine im Verlauf, und der Anmelde-Endpunkt hält allen zehn geprüften Punkten stand. Geändert wurden zwei Lücken ohne Schaden: Berichtsentwürfe überlebten das Abmelden auf geteilten Geräten, und .dockerignore schützte nur das Wurzelverzeichnis.',
    '[]'::JSONB,
    '["150"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.41';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.41' AND release_status <> 'production';

COMMIT;
