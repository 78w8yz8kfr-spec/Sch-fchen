-- Fassung 0.42.27 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Suche und Glocke in der Kopfzeile.
--
-- Beide standen im Entwurf und fehlten bisher mit Absicht: ein Bedienelement,
-- das nichts tut, ist schlechter als keines. Jetzt tun sie etwas.
--
-- Die Suche durchsucht Baustellen, Kunden, Mitarbeiter und Berichte und
-- springt in den passenden Bereich. Sie arbeitet mit dem, was ohnehin geladen
-- ist - eine Suche, die etwas findet, was der Bildschirm daneben nicht kennt,
-- waere schlimmer als keine.
--
-- Die Glocke zaehlt, was jemand tun muss, nicht was passiert ist: Berichte zur
-- Freigabe, Zeitkorrekturen zur Pruefung, offene Abwesenheitsantraege, Wochen
-- im Berichtsheft zum Abzeichnen und Baustellen, die der Monteur angelegt hat
-- und die das Buero bestaetigen muss. Eine Meldung, die niemanden zu etwas
-- auffordert, ist eine Ablenkung.
--
-- Beides gilt nur fuer die Planung: ein Monteur hat weder etwas freizugeben
-- noch einen Betrieb zu durchsuchen.
--
-- Am Telefon steht in der Kopfzeile kein Platz dafuer. Dort fuehrt der Weg
-- ueber die Bereiche selbst, die jeweils ihr eigenes Suchfeld haben.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v69) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.27', 'superseded', CURRENT_TIMESTAMP,
    'Suche und Glocke in der Kopfzeile, beide aus vorhandenen Daten.',
    '[]'::JSONB,
    '["080"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.27';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.27'
  AND release_status <> 'production';

COMMIT;
