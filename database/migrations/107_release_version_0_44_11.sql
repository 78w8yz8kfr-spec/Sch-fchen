-- Fassung 0.44.11 als Produktionsstand eintragen.
--
-- Ausbildungsberuf und Ausbildungszeitraum lassen sich endlich eintragen.
--
-- Die Spalten liegen seit Migration 056 (`apprenticeship_started_on`,
-- `apprenticeship_ends_on`) und 060 (`apprenticeship_occupation`) in der
-- Datenbank, das gedruckte Wochenblatt liest sie, und es gab keinen einzigen
-- Weg, sie zu füllen. Im Kopf jedes Nachweises stand deshalb ein Strich, wo
-- die Kammer den Ausbildungsberuf erwartet, und das Lehrjahr blieb leer.
--
-- Beides gehört in den Personalbogen, neben den Ausbilder: dort steht schon,
-- wer den Nachweis unterschreibt. Das Lehrjahr wird aus dem Beginn gerechnet
-- und nicht gepflegt — von Hand gepflegt wäre es spätestens im zweiten Jahr
-- falsch.
--
-- Das Datenmodell bleibt unverändert; neu ist allein der Weg dorthin.
--
-- Zu dieser Fassung gehört der App-Shell-Speicher schaefchen-online-v93.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.11', 'superseded', CURRENT_TIMESTAMP,
    'Ausbildungsberuf und Ausbildungszeitraum lassen sich im Personalbogen eintragen; Lehrjahr und Beruf stehen damit im gedruckten Berichtsheft.',
    '[]'::JSONB,
    '["107"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.11';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.11'
  AND release_status <> 'production';

COMMIT;
