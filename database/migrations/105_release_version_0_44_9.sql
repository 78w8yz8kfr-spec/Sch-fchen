-- Fassung 0.44.9 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Baustellenakte des Vorarbeiters kann etwas.
--
-- Die Akte gab es laengst, mit sieben Reitern - Uebersicht, Aufgaben,
-- Berichte, Fotos, Dokumente, Material, Notizen. Angefasst hat sie fast
-- nichts: nur Fotos und Notizen liessen sich anlegen, alles andere war zum
-- Ansehen da.
--
-- Material. Wer es verbaut, sieht zuerst, was fehlt: der Vorarbeiter weiss
-- abends, was von der Rolle runter ist und was morgen frueh dabei sein muss.
-- Eintragen konnte es nur das Buero. Der einzige Weg war eine Notiz - dort hat
-- Material keine Menge, keine Einheit und keinen Stand, und niemand kann
-- danach suchen. Jetzt traegt er es selbst ein und schaltet den Stand weiter:
-- benoetigt, bestellt, vor Ort, verbraucht. Immer genau ein naechster Schritt,
-- weil der Eintrag den Verlauf abbildet und nicht rueckwaerts geht.
--
-- Der Zugang ist derselbe wie bei Notizen und Fotos: wer an diesem Tag dort
-- eingeteilt ist. Material ist Sache des ganzen Trupps - wer die Kabeltrommel
-- holt, soll es eintragen duerfen. Das Buero darf es ohnehin, ein Monteur ohne
-- Einteilung auf dieser Baustelle nicht.
--
-- Berichte. In der Akte stand nur die Liste. Wer einen Bericht schreiben
-- wollte, musste sie verlassen und ihn auf der Startseite suchen - obwohl er
-- gerade auf der Baustelle steht, um die es geht. Jetzt fuehrt ein Knopf
-- direkt zum Bericht fuer diese Baustelle, mit ihrer Pruefung und ihrem
-- Entwurfsspeicher.
--
-- Das Datenmodell blieb, wie es war: site_material_entries gibt es seit
-- Migration 030. Neu sind zwei Wege dorthin, die nicht ueber das Buero fuehren.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v91) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.9', 'superseded', CURRENT_TIMESTAMP,
    'Der Vorarbeiter traegt Material ein und schreibt Berichte aus der Baustellenakte.',
    '[]'::JSONB,
    '["105"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.9';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.9'
  AND release_status <> 'production';

COMMIT;
