-- Fassung 0.42.35 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: drei Dinge, die niemand sehen konnte.
--
-- Erstens: das Material war der einzige abschaltbare Bereich mit eigenem
-- Bildschirm, dessen Routen nicht am Modul geprueft wurden. Abgeschaltet
-- verschwand er aus der Oberflaeche, blieb ueber die Schnittstelle aber voll
-- bedienbar - der Schalter der Plattformverwaltung war dort eine reine
-- Anzeige. Alle anderen Bereiche hatten ihren Waechter laengst; jetzt auch
-- das Material, beim Anlegen wie beim Aendern.
--
-- Zweitens: der Bearbeitungsbogen fuer Projekte war fertig gebaut, die
-- Schnittstelle nahm Aenderungen an - nur rief niemand ihn auf. Ein Projekt
-- liess sich anlegen und danach nie wieder aendern, auch nicht abschliessen.
-- Die Kundenansicht fuehrt jetzt auch die Projekte, mit demselben Weg hinein
-- wie bei den Kunden.
--
-- Drittens: drei Verwaltungslisten - Baustellen, Kunden, Projekte - wurden bei
-- jedem Aktualisieren und bei jedem Tastendruck neu aufgebaut, ohne dass sie
-- jemals jemand zu sehen bekam. Sie sind Reste aus der Zeit vor den heutigen
-- Uebersichten. An der laufenden App ueber alle Bereiche nachgemessen und dann
-- entfernt.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v77) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.35', 'superseded', CURRENT_TIMESTAMP,
    'Materialschalter greift, Projekte lassen sich aendern, tote Listen entfernt.',
    '[]'::JSONB,
    '["090"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.35';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.35'
  AND release_status <> 'production';

COMMIT;
