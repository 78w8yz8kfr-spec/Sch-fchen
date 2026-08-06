-- Fassung 0.42.22 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Seitenleiste des Entwurfs mit allen Bereichen.
--
-- Bisher fuehrte die Leiste fuenf Eintraege, und dahinter lagen drei
-- Bildschirme: Baustellen, Einsatzplanung und "Mehr". Unter "Mehr" stand
-- alles andere untereinander - Mitarbeiter, Jahreskonten, Feiertage, Zugang.
-- Wer die Mitarbeiterliste wollte, scrollte an drei Tafeln vorbei.
--
-- Jeder Eintrag hat jetzt einen eigenen Bereich: Dashboard, Baustellen,
-- Einsatzplanung, Zeiterfassung, Berichte, Pruefprotokolle, Azubi,
-- Mitarbeiter, Kunden, Dokumente, Einstellungen. Die Tafeln sind dieselben,
-- sie sind umgezogen.
--
-- Zwei Bildschirme sind neu, weil es sie noch nicht gab:
--   Kunden - eine Liste mit Nummer, Ansprechpartner, Projekten und laufenden
--     Baustellen. Die Spalte "Offene Rechnungen" aus dem Entwurf fehlt: es
--     gibt in Schaefchen keine Rechnungsstellung, und eine Spalte mit
--     erfundenen Betraegen waere schlimmer als keine.
--   Pruefprotokolle - alle VDE-Pruefungen des Betriebs an einer Stelle. Bisher
--     waren sie nur in der Akte der einzelnen Baustelle zu finden.
--
-- Material und Fahrzeuge stehen im Entwurf ebenfalls in der Leiste. Dahinter
-- liegt noch kein Bildschirm; ein Eintrag, der nichts oeffnet, ist schlechter
-- als keiner. Sie kommen, wenn es die Bildschirme gibt.
--
-- Am Telefon fasst die untere Leiste weiterhin fuenf Eintraege. Die uebrigen
-- Bereiche stehen unter "Einstellungen" als Liste - sie entsteht aus
-- denselben Schaltflaechen wie die Leiste und kann deshalb nicht
-- auseinanderlaufen.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v64) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.42.22', 'superseded', CURRENT_TIMESTAMP,
    'Neues Design, fuenfter Schritt: Seitenleiste mit allen Bereichen des Entwurfs.',
    '[]'::JSONB,
    '["074"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.42.22';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.42.22'
  AND release_status <> 'production';

COMMIT;
