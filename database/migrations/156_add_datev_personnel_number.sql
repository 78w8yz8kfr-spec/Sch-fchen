-- Rein numerische DATEV-Personalnummer je Mitarbeiter.
--
-- WORUM ES GEHT
--
-- Migration 151 legte die Grundlage der DATEV-Lohnschnittstelle, aber ein
-- Exportfeld bleibt bis hierher ungeloest: Feld 1 des Bewegungsdatensatzes,
-- die Personalnummer, soll aus 'users.personnel_number' kommen - und die ist
-- in Schaefchen freier Text ('M-1', 'ADMIN-1', 'REG-0001', einzige Bedingung
-- "nicht leer"). DATEV liest die Personalnummer dagegen als rein numerische
-- Kennung. Selbst mit allen Nummern der Kanzlei wuerde eine Exportdatei daran
-- scheitern, siehe docs/DATEV_EXPORT.md, Abschnitt "Offene Punkte".
--
-- Diese Migration loest das mit einer zusaetzlichen Spalte, nicht mit einer
-- Aenderung der vorhandenen: 'M-1' ist fuer den Betrieb lesbar und steht
-- ueberall in der App; die numerische Kennung tritt daneben, nur fuer den
-- DATEV-Export gebraucht.
--
-- KEINE HISTORISIERUNG - ANDERS ALS DIE LOHNARTENZUORDNUNG
--
-- 'datev_wage_type_mappings' (Migration 151) historisiert bewusst: dort
-- zaehlt, welche Lohnart zu welchem Zeitpunkt galt, weil ein Export fuer den
-- Vormonat die damalige Zuordnung braucht. Eine Personalnummer ist dagegen
-- eine Identitaet, kein zeitlich veraenderlicher Satz - eine geaenderte
-- Nummer war vorher schlicht falsch. Deshalb eine gewoehnliche Spalte auf
-- 'users', gegen gleichzeitiges Ueberschreiben durch die ohnehin vorhandene
-- 'row_version' der Tabelle geschuetzt (die Anwendung prueft sie beim
-- UPDATE, siehe api/src/datev.mjs); kein zweiter Verlauf, den niemand liest.
--
-- WARUM FUEHRENDE NULLEN VERBOTEN SIND
--
-- Erlaubt ist '^[1-9][0-9]{0,4}$' - eine bis fuenf Ziffern, nicht mit Null
-- beginnend. Der Grund ist keine Schikane, sondern eine Deckungsluecke, die
-- sonst zwei Menschen auf ein Lohnkonto buchen wuerde: DATEV liest die
-- Personalnummer als Zahl. Stuenden bei uns "123" und "0123" als zwei
-- verschiedene Mitarbeiter, waeren sie bei DATEV dieselbe Person - unsere
-- Eindeutigkeitspruefung unten wuerde das nicht bemerken, weil sie auf dem
-- Text vergleicht, nicht auf der Zahl. Ein Verbot fuehrender Nullen macht
-- "eindeutig bei uns" und "eindeutig bei DATEV" deckungsgleich.
--
-- Die Obergrenze von fuenf Stellen stammt aus allgemeiner Kenntnis der
-- DATEV-Nummernkreise, nicht aus einem geprueften Dokument - wie die uebrigen
-- Feldlaengen in Migration 151 (siehe dort und docs/DATEV_EXPORT.md).
--
-- NULL ERLAUBT, EINDEUTIG NUR WO GESETZT
--
-- Nicht jeder Betrieb pflegt die Nummer sofort, und ein Betrieb ohne DATEV
-- braucht sie nie - deshalb NULL statt Pflichtfeld. Der eindeutige Index ist
-- deshalb partiell ('WHERE datev_personnel_number IS NOT NULL'): eine fehlende
-- Nummer heisst "nicht gepflegt", nicht "gleich mit jedem anderen ungepflegten
-- Mitarbeiter" - die Eindeutigkeit soll ausschliesslich unter tatsaechlich
-- gesetzten Nummern gelten, nie Mitarbeiter ohne Nummer gegeneinander sperren.
--
-- RECHTE
--
-- 'schaefchen_api' hat auf 'users' aus Migration 003 ein tabellenweites
-- GRANT SELECT, INSERT, UPDATE - kein spaltenbezogenes. Eine neue Spalte ist
-- damit automatisch mit abgedeckt; diese Migration muss die Rechte nicht
-- erneut vergeben.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS datev_personnel_number VARCHAR(5);

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_datev_personnel_number_format_check;

ALTER TABLE users
    ADD CONSTRAINT users_datev_personnel_number_format_check
    CHECK (datev_personnel_number IS NULL OR datev_personnel_number ~ '^[1-9][0-9]{0,4}$');

-- Eindeutig je Firma, aber nur dort, wo eine Nummer tatsaechlich gepflegt
-- ist - siehe Begruendung oben.
CREATE UNIQUE INDEX IF NOT EXISTS users_company_datev_personnel_number_key
    ON users (company_id, datev_personnel_number)
    WHERE datev_personnel_number IS NOT NULL;

COMMENT ON COLUMN users.datev_personnel_number IS
    'Rein numerische Personalnummer fuer den DATEV-Lohnexport (ein bis fuenf Ziffern, keine fuehrende Null); NULL heisst "nicht gepflegt". Getrennt von personnel_number (Migration 002), das freier, betrieblich lesbarer Text bleibt.';

COMMIT;
