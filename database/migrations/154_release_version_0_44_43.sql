-- Fassung 0.44.43 als Produktionsstand eintragen.
--
-- Warum eine reine Stiländerung eine neue Fassungsnummer braucht: Die
-- Stilblätter haengen im Dienst-Worker an "?v="-Parametern. Ohne neue Nummer
-- laedt ein Telefon weiter das alte design-system.css aus dem Zwischenspeicher
-- - die Reparatur der Navigationsleiste erreichte dann niemanden.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v125).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.43', 'superseded', CURRENT_TIMESTAMP,
    'Die untere Navigationsleiste schwebte auf dem iPhone mitten im Inhalt statt unten am Rand. Zwei Angaben auf derselben Leiste zwangen WebKit auf eine eigene Kompositionsebene, die beim Blaettern an einer alten Stelle stehenblieb: eine Hintergrundunschaerfe und ein "overflow-x: hidden", das die Leiste unbemerkt zum Scrollcontainer machte. Beides entfernt; der Hintergrund ist jetzt undurchsichtig statt zu 95 Prozent deckend.',
    '[]'::JSONB,
    '["154"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.43';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.43' AND release_status <> 'production';

COMMIT;
