-- Fassung 0.42.31 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: der Resturlaub steht neben den Stunden.
--
-- Auf der Uebersicht stand bisher nur eine Zahl: der Stand des Arbeitskontos.
-- Der Resturlaub lag im Wochenbereich, einen Bereichswechsel entfernt. Beide
-- Zahlen beantworten dieselbe Frage - was steht mir noch zu -, und wer die
-- eine ansieht, will meist auch die andere wissen. Sie stehen jetzt
-- nebeneinander in derselben Karte.
--
-- Zwei gleich breite Spalten, nicht "so breit wie noetig": sonst wandert die
-- zweite Zahl mit jeder Stelle, die die erste dazugewinnt, und die Karte sieht
-- bei jedem Blick anders aus.
--
-- Die Karte steht ab jetzt auch dann da, wenn das Stundenkonto deaktiviert
-- ist. Dann steht "Deaktiviert" statt der Stunden - der Urlaub laeuft davon
-- unabhaengig weiter. Der Wochenbereich sagt das schon ausdruecklich
-- ("Urlaubsstaende bleiben sichtbar"); die Uebersicht hat ihm bisher
-- widersprochen, indem sie die ganze Karte wegliess.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v73) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.31', 'superseded', CURRENT_TIMESTAMP,
    'Resturlaub steht auf der Uebersicht neben den Stunden.',
    '[]'::JSONB,
    '["086"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.31';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.31'
  AND release_status <> 'production';

COMMIT;
