-- Fassung 0.44.12 als Produktionsstand eintragen.
--
-- Inhalt dieser Fassung: das Lager funktioniert ohne Netz, und Artikel bekommen
-- Gebinde, aus denen sich auch einzelne Stuecke entnehmen lassen.
--
-- Ein Lager liegt im Keller, und auf der Baustelle steht der Monteur hinterm
-- Rohbau. Genau dort war das Lager bisher nicht zu gebrauchen: der Scan lief
-- ueber den Server, also scheiterte schon der erste Schritt, und eine Buchung
-- ohne Verbindung war verloren.
--
-- Jetzt merkt sich das Geraet, was es schon einmal gescannt hat. Wer denselben
-- Artikel zum zweiten Mal vor die Kamera haelt, kommt auch ohne Netz zur
-- Buchung; der Bestand daneben traegt den Hinweis, dass er vom letzten Scan
-- mit Verbindung stammt. Ein Code, den dieses Geraet noch nie gesehen hat,
-- sagt das - und nicht "Der Server ist nicht erreichbar", was im Keller
-- ohnehin klar ist.
--
-- Die Buchung selbst geht in eine Warteschlange auf dem Geraet und wird
-- nachgetragen, sobald wieder Empfang da ist - auch nach einem Neustart der
-- App. Das ist nur deshalb gefahrlos, weil jede Buchung ihre Vorgangsnummer
-- schon beim Tippen bekommt: zweimal geschickt zaehlt sie einmal. Die
-- Startseite sagt, wie viele noch warten. Was der Server ablehnt, faellt aus
-- der Schlange und wird gemeldet - mit Menge und Artikel, damit es sich von
-- Hand nachholen laesst; sonst wuerde es jeden weiteren Nachtrag aufhalten.
--
-- Die Inventur bleibt bewusst aussen vor: sie zaehlt gegen einen Sollbestand
-- vom Server, und gegen einen veralteten zu zaehlen erzeugt Korrekturen, die
-- nichts richtigstellen, sondern etwas kaputtmachen.
--
-- Zweitens bekommt der Artikel sein Gebinde (Migration 111). Bisher stand die
-- Gebindemenge nur am Code: wer den Karton scannte, buchte hundert Stueck, und
-- das war es. Es gab das Gebinde also nur, wenn der Hersteller einen eigenen
-- Code auf den Karton gedruckt hat - eine Rolle Kabel, ein Bund Klemmen, alles
-- was der Betrieb selbst zu Gebinden macht, liess sich nicht abbilden. Jetzt
-- steht die Stueckzahl am Artikel, mit Namen: Karton, Rolle, Bund.
--
-- Und aus jedem Gebinde laesst sich ein einzelnes Stueck entnehmen. Beim Buchen
-- steht die Wahl ueber der Menge - "Karton (100 Stück)" oder "Stück einzeln" -,
-- und die Plusschaltflaeche zaehlt in der gewaehlten Einheit statt in
-- Hundertern. Der Bestand bleibt dabei in der Einheit des Artikels: das Gebinde
-- ist eine Art, ueber die Menge zu sprechen, kein zweiter Bestand daneben.
-- Sonst haette ein Lager zwei Zahlen, die auseinanderlaufen koennen.
--
-- Artikel, die es vorher schon gab, bekommen ihr Gebinde ueber den neuen
-- Endpunkt PATCH /api/v1/stock/items/:id nachtraeglich.
--
-- Dazu drei Dinge, die im Alltag gefehlt haben:
--
-- 1. Ein gedrucktes Etikett, mit der Kamera des Telefons gescannt, fuehrt jetzt
--    in die App zum Artikel. Vorher oeffnete sich Schaefchen und tat nichts -
--    das Etikett war ein Bild ohne Wirkung.
-- 2. Der Lagerplatz laesst sich aus einer Liste waehlen, mit vollem Pfad. Die
--    bisherige Schaltflaeche schaltete reihum weiter: bei drei Plaetzen
--    ertraeglich, bei dreissig eine Zumutung. Der zuletzt gewaehlte Platz
--    ueberlebt jetzt auch das Schliessen der App.
-- 3. Die Artikelliste hat ein Suchfeld. Die Schnittstelle konnte es laengst,
--    die Oberflaeche fragte nur nie danach.
--
-- Der Offline-Teil brauchte keine Datenbankaenderung: das Datenmodell trug den
-- Fall von Anfang an, es wurde nur nie benutzt.
--
-- Zu dieser Fassung gehoeren ein neuer Speichername des Dienst-Workers
-- (schaefchen-online-v94) und neue Fassungsangaben an allen Dateien.

BEGIN;

INSERT INTO application_versions (
    version, release_status, released_at, changelog,
    known_issues, database_migrations, rollout_percent, mandatory_update
) VALUES (
    '0.44.12', 'superseded', CURRENT_TIMESTAMP,
    'Das Lager funktioniert ohne Netz: gescannte Artikel bleiben auf dem Gerät, Buchungen werden nachgetragen. Artikel bekommen Gebinde, aus denen sich auch einzelne Stücke entnehmen lassen. Dazu Etikettenlinks, Lagerplatzauswahl und Artikelsuche.',
    '[]'::JSONB,
    '["111", "112"]'::JSONB, 100, FALSE
)
ON CONFLICT (version) DO NOTHING;

UPDATE application_versions
SET release_status = 'superseded'
WHERE release_status = 'production'
  AND version <> '0.44.12';

UPDATE application_versions
SET release_status = 'production',
    rollout_percent = 100
WHERE version = '0.44.12'
  AND release_status <> 'production';

COMMIT;
