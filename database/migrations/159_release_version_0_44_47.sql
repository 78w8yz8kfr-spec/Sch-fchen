-- Fassung 0.44.47 als Produktionsstand eintragen.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v129).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.47', 'superseded', CURRENT_TIMESTAMP,
    'Das Genehmigungsverfahren fuer Urlaubsantraege ist jetzt als klare zweistufige Kette dargestellt: Stufe 1 Buero/Disposition, Stufe 2 Geschaeftsfuehrung, jede mit sichtbarer Zustaendigkeit und - bei erledigten Stufen - dem Namen der Person. Der Monteur sieht in seiner eigenen Liste "wartet auf Bueropruefung" bzw. "wartet auf Freigabe durch die Geschaeftsfuehrung" statt eines kryptischen Abzeichens. So entsteht nicht mehr der Eindruck, jeder koenne genehmigen. Die Berechtigungen selbst sind unveraendert: nur Buero/Planung pruefen, nur die Geschaeftsfuehrung gibt frei, und beides muessen zwei verschiedene Personen sein.',
    '[]'::JSONB,
    '["159"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.47';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.47' AND release_status <> 'production';

COMMIT;
