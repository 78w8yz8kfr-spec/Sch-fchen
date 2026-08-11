-- Eine Buchung wird hoechstens einmal storniert.
--
-- Die Gegenbuchung traegt seit Migration 107 die Kennung der Buchung, die sie
-- aufhebt. Was fehlte, war die Zusicherung, dass es zu einer Buchung nur eine
-- Gegenbuchung gibt.
--
-- Der naheliegende Weg waere gewesen, die Buchung beim Stornieren zu sperren.
-- Das geht hier bewusst nicht: `stock_movements` ist ein Journal, und die
-- API-Rolle darf darin nur lesen und anfuegen - kein UPDATE, kein DELETE, und
-- damit auch kein SELECT ... FOR UPDATE. Diese Beschraenkung ist keine Huerde,
-- sondern der Grund, warum niemand eine gebuchte Zeile still veraendern kann.
--
-- Der eindeutige Index leistet dasselbe und mehr: er haelt auch dann, wenn
-- zwei Verbindungen gleichzeitig stornieren, und er gilt unabhaengig davon,
-- welcher Code buchen darf. Aus zwei gleichzeitigen Klicks wird eine
-- Gegenbuchung und ein Fehler, nicht ein Bestand, der sich mit jedem Klick
-- weiter von der Wirklichkeit entfernt.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_reversal_unique
    ON stock_movements (company_id, reverses_movement_id)
    WHERE reverses_movement_id IS NOT NULL;

COMMIT;
