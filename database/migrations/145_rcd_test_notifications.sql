-- Der faellige FI-Test meldet sich beim zustaendigen Vorarbeiter.
--
-- WARUM KEINE EIGENE TABELLE
--
-- Hinweise zu Geraeten stehen seit Migration 095 in `device_notifications`:
-- Prueftermin, Mangel, verschollenes Geraet, lange Leihe. Ein Baustromverteiler
-- ist ein Geraet, sein FI-Test ist ein Termin an diesem Geraet - und die
-- Glocke oben rechts ist eine. Eine zweite Hinweistabelle haette eine zweite
-- Glocke oder eine Zusammenfuehrung im Frontend gebraucht; beides ist mehr
-- Bauwerk als Nutzen.
--
-- Die Tabelle bleibt deshalb, wie sie ist. Nur ihre Liste erlaubter Arten
-- bekommt zwei Eintraege dazu.
--
-- WARUM ZWEI ARTEN UND NICHT EINE
--
-- Genauso wie bei der Pruefung: "heute faellig" und "seit acht Tagen
-- ueberfaellig" verlangen verschiedene Reaktionen, und wer die Liste
-- durchsieht, will das Dringende oben haben. Eine Art mit wechselndem Titel
-- liesse sich nicht sortieren und nicht filtern.

BEGIN;

ALTER TABLE device_notifications
    DROP CONSTRAINT IF EXISTS device_notifications_type_check;

ALTER TABLE device_notifications
    ADD CONSTRAINT device_notifications_type_check CHECK (notification_type IN (
        'fixed_device_taken', 'fixed_device_returned', 'inspection_due',
        'inspection_overdue', 'defect_reported', 'device_missing', 'long_loan',
        'rcd_test_due', 'rcd_test_overdue'
    ));

COMMENT ON COLUMN device_notifications.notification_type IS
    'Art des Hinweises. rcd_test_due und rcd_test_overdue betreffen den monatlichen Druck auf die Prueftaste eines Baustromverteilers und nicht die vierteljaehrliche Pruefung.';

COMMIT;
