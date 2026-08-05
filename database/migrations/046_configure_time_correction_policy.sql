BEGIN;

-- Bis hierher wurde jede eigene Zeitkorrektur sofort wirksam, solange der
-- Arbeitstag noch nicht freigegeben oder abgerechnet war. Das Büro erfuhr davon
-- nichts. Ob das zulässig ist, ist eine betriebliche Entscheidung und keine
-- Eigenschaft der Software: in manchen Betrieben soll der Monteur seinen Tag
-- selbst geradeziehen dürfen, in anderen gehört jede Änderung geprüft.
--
-- Die Firma wählt daher zwischen drei Regeln:
--
--   review_required  Jede eigene Änderung und Löschung wird zum Antrag und
--                    wirkt erst nach Freigabe durch das Büro.
--   same_day         Am selben Kalendertag sofort wirksam, für zurückliegende
--                    Tage prüfpflichtig.
--   immediate        Sofort wirksam bis zur Freigabe des Arbeitstags. Das
--                    bisherige Verhalten.
--
-- Voreinstellung ist review_required. Bestehende Firmen wechseln damit
-- ausdrücklich auf die geprüfte Variante; das ist eine bewusste Änderung des
-- Verhaltens und keine Nebenwirkung.
--
-- Für das Büro ändert sich nichts: die Bearbeitung fremder Zeiten über die
-- Verwaltung bleibt von dieser Regel unberührt und folgt weiterhin allein dem
-- Status des Arbeitstags.

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS time_correction_policy VARCHAR(20) NOT NULL
        DEFAULT 'review_required';

ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_time_correction_policy_check;

ALTER TABLE companies
    ADD CONSTRAINT companies_time_correction_policy_check CHECK (
        time_correction_policy IN ('review_required', 'same_day', 'immediate')
    );

COMMENT ON COLUMN companies.time_correction_policy IS
    'Regel für eigene Zeitkorrekturen vor der Freigabe des Arbeitstags: review_required, same_day oder immediate.';

-- Die Firmenrolle liest ihre eigene Regel; ändern darf sie nur die
-- Firmenverwaltung über die API, die dafür bereits UPDATE auf companies besitzt.
GRANT SELECT (
    id, company_number, legal_name, display_name, status, time_correction_policy
) ON companies TO schaefchen_api;

COMMIT;
