-- Fassung 0.44.16 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: Material geht auf die Baustelle und kommt von dort
-- zurueck.
--
-- Beides war bisher nur halb da. Die Entnahme konnte eine Baustelle tragen,
-- die Rueckgabe nicht: im Journal stand dann eine Entnahme auf die Baustelle
-- und daneben ein Zugang aus dem Nichts. Wer spaeter fragte, was eine
-- Baustelle wirklich verbraucht hat, bekam die ausgegebene Menge und nicht die
-- verbaute - der Rest, der abends zurueck ins Regal ging, fehlte in der
-- Rechnung. Die Rueckgabe traegt die Baustelle jetzt mit.
--
-- Und die Auswahl war fuer den Falschen gebaut. Sie kannte nur die Baustellen
-- aus dem eigenen Tagesplan. Fuer den Monteur stimmt das, fuer den Lageristen
-- nicht: der gibt Material fuer Baustellen heraus, auf denen er selbst nie
-- steht, und sah deshalb ueberhaupt kein Auswahlfeld. Der Lagerbereich liefert
-- die laufenden Baustellen des Betriebs jetzt mit; die eigenen stehen oben,
-- der Rest darunter. Abgeschlossene, abgebrochene und archivierte fehlen -
-- auf sie soll nichts mehr gebucht werden.
--
-- Die gewaehlte Baustelle bleibt zwischen zwei Buchungen stehen, wie der
-- Lagerplatz: wer eine Baustelle ruestet, bucht zehn Artikel nacheinander.
-- Ueber einen Neustart der App traegt sie bewusst nicht. Ohne Netz bleibt die
-- zuletzt geladene Liste im Speicher des Geraets, und eine Buchung mit
-- Baustelle geht mitsamt der Baustelle in die Warteschlange.
--
-- Keine Datenbankaenderung: `stock_movements.construction_site_id` und der
-- Fremdschluessel auf `construction_sites` stehen seit Migration 107.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v98) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.16', 'superseded', CURRENT_TIMESTAMP,
    'Material lässt sich auf eine Baustelle entnehmen und von dort ins Lager zurückgeben; zur Wahl stehen alle laufenden Baustellen des Betriebs.',
    '[]'::JSONB,
    '["116"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.16';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.16'
  AND release_status <> 'production';

COMMIT;
