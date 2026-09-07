-- Fassung 0.44.40 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: die Zeitkorrektur ist wieder benutzbar, dazu
-- Dokumentenformate, Speicherung und Bedienung.
--
-- WAS IM BETRIEB NICHT GING
--
-- Wer einen Arbeitstag komplett vergessen hatte, kam an ihn nicht heran, und
-- wer es doch versuchte, bekam Fehlermeldungen. Dahinter lagen drei Ursachen
-- uebereinander.
--
-- In der Wochenansicht bekam ein Tag ohne Buchung gar keine Karte, und der
-- Knopf "Fehlende Buchung ergaenzen" stand im Zweig fuer Tage, die schon
-- Buchungen haben. Ausgerechnet der vergessene Tag - der einzige, der das
-- Nachtragen braucht - war der einzige ohne Weg dorthin.
--
-- Serverseitig brach `createTimeEntryAddition` mit "Fuer diesen Tag existiert
-- noch kein Stundenzettel" ab. Ein Tag, an dem nie gestempelt wurde, hat aber
-- keine Zeile in `work_days`. Die Nachbarfunktion `targetWorkDay` legt sie bei
-- Bedarf an, das normale Stempeln ebenso - nur das Nachtragen nicht.
--
-- Und die Auswahlliste bot Baustellen im Status `delayed` an, waehrend die
-- Speicherpruefung genau diesen Status ablehnte und antwortete, die Baustelle
-- sei nicht gefunden. Der Monteur waehlte also etwas aus, das die App ihm
-- selbst vorgeschlagen hatte.
--
-- WAS SICH AN BERECHTIGUNGEN AENDERT
--
-- Wollte das Buero eine Zeit an einem freigegebenen Tag berichtigen, las es
-- eine Meldung ueber Mitarbeiterloeschung: `requireEmployeeLifecycleAdministrator`
-- war dort sachfremd mitbenutzt und verengte nebenbei auf Administration und
-- Geschaeftsfuehrung. Nach Entscheidung des Betreibers duerfen Buero und
-- Disposition das. Damit prueft die Stelle genau `requireFullPlanner` - und
-- das ist zwei bis drei Zeilen darueber ohnehin schon geschehen.
--
-- An der Datenbank aendert das nichts: bei gesperrtem Tag entsteht weiterhin
-- immer ein Vorgang in `time_change_operations` mit Vorher-/Nachher-Stand und
-- Pflichtgrund, nie eine stille Direktaenderung.
--
-- WAS DER MONTEUR JETZT SIEHT
--
-- Die Historie in `time_change_operations` und `time_change_items` wurde
-- vollstaendig gefuehrt, sehen konnte sie nur die Verwaltung. Eine Historie,
-- die der Betroffene nicht sehen kann, ist keine. Er sieht sie jetzt lesend -
-- was sich geaendert hat, warum, durch wen und ob es bereits gebucht oder
-- erst beantragt ist. Genehmigen kann er nichts; das bleibt bei der
-- Verwaltung.
--
-- Zu dieser Fassung gehoert ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v122).

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.40', 'superseded', CURRENT_TIMESTAMP,
    'Vergessene Arbeitstage lassen sich wieder nachtragen, verzögerte Baustellen sind auswählbar, und der Monteur sieht, was das Büro an seinen Zeiten geändert hat. Dazu inhaltsbasierte Prüfung hochgeladener Dateien, ein Schutz gegen Zeichen, an denen die PDF-Erzeugung abbrach, und ein voller lokaler Speicher kostet nicht mehr den Arbeitstag.',
    '[]'::JSONB,
    '["149"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production' AND version <> '0.44.40';

UPDATE application_versions
SET release_status = 'production', rollout_percent = 100
WHERE version = '0.44.40' AND release_status <> 'production';

COMMIT;
