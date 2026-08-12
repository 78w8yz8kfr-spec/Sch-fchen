# Projektstatus

Stand: 11.08.2026
Technischer Stand: V0.44.35


## Abgeschlossen

- **Die Lagerverwaltung ist abgeschafft** (Fassung 0.44.35, Migrationen 141
  und 142). Sie kam mit 0.44.11 und wuchs über vierundzwanzig Fassungen:
  Artikelstamm, Lagerplätze, Bewegungsjournal, Strichcodes und Etiketten,
  Inventur, Bestellwesen, Lieferscheine, Reservierungen, Fahrzeug- und
  Retourenlager sowie zuletzt die Texterkennung auf fotografierten Belegen.
  Entfernt sind Bereich, Navigationseintrag, alle Endpunkte unter
  `/api/v1/stock`, der Modulschlüssel `warehouse`, der Strichcodeleser, die
  Werkbank und Tesseract samt ImageMagick aus dem Auslieferungsimage. Die
  vierzehn Tabellen sind samt Inhalt gelöscht — Bestände, Bewegungen, Belege
  und Bestellungen stehen nur noch in einer Sicherung von vorher. Die Rolle
  „Lagerist" ist stillgelegt statt gelöscht, weil widerrufene Zuweisungen
  darauf zeigen: wer wann welche Berechtigung hatte, ist Personalgeschichte
  und war nie Teil des Lagers. Die Materialliste der Baustelle bleibt
  vollständig, nur ohne Bestandsanzeige; PWA-Speicher
  `schaefchen-online-v117`

- Einstellungen in voller Breite: Arbeitskonten, Feiertage und Zeitregeln
  belegten im zweispaltigen Raster nur eine Spalte (500 statt 1016 Bildpunkte),
  obwohl die Reiter immer nur eine Tafel zeigen; Baustellenseite ohne zweite
  Unterzeile, der Excel-Hinweis steht jetzt im Anlegeformular;
  PWA-Speicher `schaefchen-online-v112`

- Filterleiste der Plantafel bricht um statt abgeschnitten zu werden: Baustelle,
  Projektleiter und Planstatus waren am Telefon hinter dem Bildrand und durch
  `overflow-x: hidden` unerreichbar; Beschriftung und Feld im Stundenexport
  stehen wieder beieinander (10 statt ~500 Bildpunkte);
  PWA-Speicher `schaefchen-online-v111`

- Einsatzplanung entzerrt: Tageslage zuoberst statt zuunterst, Anlegeformular
  zugeklappt hinter „Neuer Einsatz", doppelte Unterzeile entfernt; 2863 → 1663
  Bildpunkte; PWA-Speicher `schaefchen-online-v110`

- Eigener Bereich „Arbeitszeiten" für Stundenzettelprüfung, Korrekturen,
  Abwesenheiten und Export; „Meine Woche" behält nur die eigenen Anträge;
  PWA-Speicher `schaefchen-online-v107`

- sichtbarer Menüpunkt „Azubi“ in der mobilen Bereichsleiste: die Ausnahme für
  das Berichtsheft steht nun hinter der allgemeinen Ausblendregel des
  Designsystems und mit derselben Durchsetzung; notwendiges Update auf
  PWA-Speicher `schaefchen-online-v91`
- mobiler Zugang zur Prüfliste für Ausbilder ohne Planungsrolle, deren „Mehr“
  im nicht sichtbaren Verwaltungsbereich liegt
- Dateien, die der Browser selbst holt, kommen auch während eines
  Pflichtupdates an: Vorschau des Wochenblatts, fertige Berichte, Dokumente,
  Baustellenfotos und VDE-Protokolle tragen die App-Fassung als `appVersion`
  im Adressteil
- Dokumente holt die App selbst, statt der Adresse zu folgen; die Ansicht
  bleibt in der App, offline gesicherte Dokumente behalten ihren Schlüssel

- eindeutige, mandantengebundene Zuordnung des gemeldeten Piet-Kontos zur
  Azubi-Rolle auch ohne unvollständig übernommene historische Berichte oder
  Rollen; dauerhafte Berichtsheft-Freigabe und notwendiges Update auf
  PWA-Speicher `schaefchen-online-v90`

- vollständige Aktualisierung von Rollen, Ausbilderstatus und Modulen beim
  Zurückkehren in eine laufende App-Sitzung; eine serverseitig reparierte
  Azubi-Rolle erscheint dadurch ohne Ab- und erneutes Anmelden in der
  Navigation
- gezielte, evidenzgebundene Wiederherstellung von Piets Azubi-Rolle sowie
  dauerhafte Berichtsheft-Freigabe für den Schaaf-Mandanten; notwendiges
  Update auf PWA-Speicher `schaefchen-online-v89`

- automatische Wiederherstellung versehentlich durch die Mitarbeiterverwaltung
  entfernter Azubi-Rollen bei belegter laufender Ausbildung; das persönliche
  Berichtsheft erscheint wieder in der mobilen Navigation
- sichere Rollenvorauswahl im Mitarbeiterformular und serverseitige Sperre
  gegen unbestätigte Azubi-Rollenverluste aus einer noch geöffneten alten App;
  PWA-Speicher `schaefchen-online-v88`

- eigenständiger mobiler Azubi-Bereich in der unteren Hauptnavigation;
  eingereichte und freigegebene Wochen belegen die Startseite nicht mehr
- kompakter Berichtsheft-Hinweis nur bei fehlendem heutigem Eintrag oder einer
  Rückgabe zur Überarbeitung; klare Einzelaktion führt direkt zum nächsten
  notwendigen Schritt

- PostgreSQL-Parameterbindung der firmenweiten Geräteübersicht korrigiert;
  Büro und Administration laden den Gerätebestand wieder ohne internen Fehler
- mobile Teileanlage mit eigener verständlicher Pflichtfeldmeldung je Teil;
  versehentlich angefügte, inhaltlich leere Teile blockieren die Anlage nicht

- vollständig bedienbare Gerätesets: Hauptgerät und beiliegende Akkus,
  Ladegeräte oder Koffer werden transaktional als einzelne Inventargegenstände
  mit eigenem QR-Code angelegt und bleiben im gemeinsamen Set sichtbar

- QR-Livekamera und QR-Fotoerkennung mit lokal ausgeliefertem Decoder für
  Safari auf iPhone/iPad; die native Browsererkennung bleibt der schnelle
  Pfad und die Kamerafreigabe ist auf Schäfchens eigene Herkunft begrenzt
- eigenständiges Akkuinventar mit QR-Code, Akkusystem, Spannung, Kapazität,
  Ladezyklen und Kapazitätstest; Gerätesets sowie Fahrzeugstandorte sind im
  relationalen Modell vorbereitet
- konfliktfeste Übergaben über Row-Lock, Gerätestand und idempotente
  Client-Operation; benutzer- und firmengetrennte Offline-Warteschlange mit
  eindeutiger serverseitiger Konfliktauflösung
- Rollenrechte für Monteur, Vorarbeiter und Geräteverwaltung; die getrennte
  Plattformadministration besitzt keine operativen Geräteendpunkte

- mobile Startseite im abgenommenen Baustellenmodus; Baustellenrollen sehen
  Start, Zeiten und Mehr, planende Rollen zusätzlich die direkt bedienbaren
  Bereiche Planung, Doku und Betrieb; der persönliche Arbeitstag erscheint pro
  Rolle nur an einer Stelle
- fachlich gruppierte Hauptnavigation mit den Bereichen „Meine Arbeit“,
  „Planung“, „Dokumentation“, „Betrieb“ und „Steuerung“ sowie automatisch
  ausgeblendeten leeren Rollen- und Modulgruppen
- echte Unterbereiche für Woche, Einstellungen und Arbeitszeit-Auswertung;
  umfangreiche Formulare und Prüfstrecken stehen nicht mehr gleichzeitig auf
  einer langen Sammelseite
- getrennt gruppierte Plattformverwaltung mit „Mandanten“, „Betrieb“ und
  „Kontrolle“ sowie automatisch ausgeblendeten leeren Berechtigungsgruppen
- normale Kunden- und Baustellenbedienung ohne sichtbare zweite Projektebene;
  technische Projektverknüpfungen und historische Daten bleiben unverändert
  erhalten
- gemeinsames referenznahes Designsystem für Betriebs-App,
  Plattformverwaltung und VDE-Editor mit zentralen Tokens für Farbe,
  Typografie, Abstände, Radien, Controls, Tabellen und Status
- kompakter Desktop-AppShell mit dunkler rollenabhängiger Seitenleiste,
  rotem Aktivzustand, schmaler Topbar und einklappbarer Navigation
- getrennte Bereiche für Woche und laufende Zeiterfassung; zusätzliche echte
  Sieben-Tage-Tabelle mit Einsatz, Soll, Ist, Differenz und Status bei Erhalt
  aller Detail-, Korrektur- und Exportfunktionen
- echte Aktiv-/Archiv-Reiter und Filter für Baustellen, Mitarbeiter und
  Prüfprotokolle sowie kompakte Upload- und Anlageabläufe für Dokumente und
  Einsatzplanung
- eigene Auswertungsansicht mit Echt-Daten aus den Jahreskonten, Filtern nach
  Jahr und Mitarbeiter sowie den bestehenden PDF- und Excel-Exporten
- Migration 039 trennt Plattformkonten, Plattformrollen, Sitzungen und Audit
  physisch von Firmenbenutzern; der Systemadministrator besitzt keine Firma,
  Mitarbeiterrolle, Einsatz- oder Zeitdaten
- eigene responsive Plattformoberfläche mit Übersicht, Firmen, Benutzern,
  Tarifen, Modulen, Support, Systemstatus, Fehlern, Versionen, Mitteilungen,
  Backups, Datenschutz, Audit und Einstellungen statt der normalen
  Betriebsnavigation
- granular konfigurierbare Plattformrollen für Superadministration, Support,
  Technik, Vertrieb, Buchhaltung und Datenschutz mit serverseitiger Prüfung an
  jedem Endpunkt
- zentrale such-, filter-, sortier- und paginierbare Firmenverwaltung mit
  Detailseite, Lebenszyklusstatus, Kontakt, Limits, Vertragssnapshots und
  letzter Aktivität
- unveränderliche Tarifpreisversionen und Firmenverträge; spätere
  Standardtarifänderungen verändern bestehende individuelle Konditionen nicht
- Plattformkatalog und historisierte Firmenfreigaben für Kern-, Spezial-,
  Integrations- und Exportmodule; Firmenkonten können Module sehen, aber nicht
  selbst aktivieren
- firmenübergreifende Kontoverwaltung ohne Arbeitszeiten oder operative
  Mitarbeiterdaten sowie getrennte Plattformadministrator- und Rollenpflege
- Einladungen, Registrierungskontrolle und erster Firmenadministrator ohne
  Vergabe von Plattformrechten
- zentrale Supportfälle und auf 60 Minuten begrenzter, begründungspflichtiger
  Supportmodus ohne Firmenmitgliedschaft mit dauerhaftem Banner, Bereichs- und
  Änderungsprotokoll
- Plattformstatus, gruppierte und bereinigte Fehler, Versions- und
  Rolloutverwaltung, zielgerichtete Mitteilungen sowie serverseitiger
  Wartungsmodus und verpflichtende App-Updates
- protokollierte Backupaufträge, abgesicherte Wiederherstellungs- und
  Datenschutzabläufe mit Vier-Augen-Prüfung und expliziter Bestätigung
- unveränderliches Plattform-Audit mit Akteur, Ziel, Zeitpunkt,
  Vorher-/Nachher-Stand, Begründung, Sitzung/IP und Ergebnis
- Migration 042 und ein vollständiger Zeitbearbeitungsdialog für Baustelle,
  Beginn, Ende, Pause, Tätigkeit, Fahrtzeit, Arbeitstag und begründetes Löschen
  des Arbeitsblocks
- unveränderliche Ersatzbuchungen, Advisory Lock, Versions- und
  Idempotenzprüfung, Zeitachsenvalidierung und gemeinsame Neuberechnung nach
  Regelversion 4 verhindern Dubletten, Überschneidungen und verlorene
  parallele Änderungen
- kontrollierter Korrekturantrag statt stiller Änderung bei freigegebenen oder
  abgerechneten Tagen
- Migration 046 macht die Regel für eigene Zeitkorrekturen zur Entscheidung der
  Firma: prüfpflichtig, am selben Tag frei oder sofort wirksam. Voreinstellung
  ist prüfpflichtig; die Bearbeitung fremder Zeiten durch das Büro bleibt davon
  unberührt
- Migration 045 unterscheidet die geprüfte von der ungeprüft wirksamen
  Korrektur: wird eine Korrektur ohne Beteiligung des Büros wirksam, bleibt das
  Prüferfeld leer und der Vorgang ist ausdrücklich als ungeprüft gekennzeichnet.
  Der Zustand lässt sich nachträglich nicht abstreifen.
- Migration 043 entscheidet anhand sämtlicher historischer Referenzen zwischen
  sicherer Hartlöschung und Archivierung, widerruft Sitzungen und künftige
  Planung und ermöglicht protokollierte Reaktivierung
- eigene Ansicht für archivierte Mitarbeiter; aktive Planung und Anmeldung
  lösen ausschließlich aktive Konten auf
- ruhige, neu geordnete Wochenansicht mit vier primären Kontowerten,
  aufklappbaren Details, nächstem Einsatz, relevanten Arbeitstagen und offenen
  Aktionen; vollständige Feiertage bleiben standardmäßig eingeklappt
- mobile Baustellenanlage mit `100dvh`, internem Scrollbereich, Safe Areas,
  sticky Speichern-Aktion, Fokus-Scroll und feldnaher Validierung ohne Verlust
  der Eingaben
- zentrale Berichtszentrale mit Statuskennzahlen, fehlenden Pflichtberichten,
  Suche, Sortierung und Filtern nach Mitarbeiter, Baustelle, Datum, Art und Status
- kontrollierte Berichtsrückgabe mit Pflichtkommentar, erneute Einreichung ohne
  Dublette, PDF-Vorschau und unveränderlicher Abschluss mit vollständiger Historie
- Berichtsentwürfe im Büro werden automatisch gesichert; Baustellenfotos mit
  Bildunterschrift erhalten eigene PDF-Bildseiten
- verbindlich geordnete Baustellenakte mit rollenabhängigem Einstieg, gemerktem
  Bereich sowie eigener Suche für Berichte, Fotos und Dokumente
- einzelne mobile Dokumentfreigabe, Offline-Priorität und benutzerbezogener
  Dokumentcache für wichtige Pläne
- stabiler Baustellen-QR-Code und Direktlink mit erneuter serverseitiger
  Berechtigungsprüfung
- aktive Projektleiterzuordnung an Projekt und Baustelle mit serverseitig
  erzwungener Sicht auf ausschließlich zugeordnete Kunden, Baustellen,
  Dokumente, Berichte, VDE-Prüfungen und Einsätze; firmenweite Verwaltungsdaten
  bleiben für reine Projektleiterkonten gesperrt
- Desktop-Plantafel mit Mitarbeiterzeilen, Wochen- und Monatsansicht,
  persistenter Teamvorlage, Kopieren/Mehrfachzuweisung, Drag-and-drop über eine
  begründungspflichtige Änderungsmaske sowie Filtern und sichtbaren Konflikten
- Migration 037 für Dokumentfreigabe, Offline-Priorität, stabile QR-Schlüssel,
  Berichtsrückgabe und unveränderliche Berichtshistorie
- Migration 038 für mandantengetrennte Teamvorlagen, historisierte
  Mitgliedsänderungen und unverändert individuelle Mitarbeitereinsätze
- nachweisbezogene Fahrplan-Abnahme und priorisierter Backlog in
  [`ROADMAP_ACCEPTANCE.md`](ROADMAP_ACCEPTANCE.md) und [`BACKLOG.md`](BACKLOG.md)
- getrennt wählbare Baustellenbereiche für Übersicht, Team, Aufgaben, Notizen, Berichte, Dokumente, Fotos, Material und optional VDE in der mobilen sowie der Büroansicht
- direkte Zuordnung der Baustellen-Schnellaktionen zum jeweils passenden Arbeitsbereich ohne lange Sammelansicht
- VDE-Messwerte beginnen auf Seite zwei; das optionale Stromkreisverzeichnis startet nach allen Messwertseiten auf einer eigenen Folgeseite
- vorhandene V15-Anwendung als erstes vollständig integriertes, ausschließlich plattformseitig freischaltbares VDE-Spezialmodul aus der Schäfchen-Baustellenakte
- gemeinsame Referenzen für Firma, Logo, Kunde, Projekt, Baustelle und Prüfer statt paralleler oder kopierter Stammdaten
- strukturierte, reihenfolgetreue Verteilungen, FI/RCD-Gruppen und Stromkreise mit LS, FI/LS, NH, Diazed, Neozed und sonstigen Schutzorganen
- getrennte Messwerte RPE, RISO, Zi, Zs und Ik sowie RCD-Auslösezeit und -strom am betroffenen Stromkreis
- optionales Stromkreisverzeichnis und ausschließlich bei Auswahl sichtbare detaillierte Isolationsmessung
- unveränderlicher, unterschriebener VDE-Abschluss als A4-PDF mit Firmenlogo, fester Fußzeile, Messwerten ab Seite zwei und optionalem Stromkreisverzeichnis auf eigener Folgeseite
- vollständige Versionshistorie, Idempotenz, RLS, Mandantentrennung, Rollen- und Tageszuweisungsprüfung in Migration 036
- automatischer deutscher Feiertagskalender mit bundesweiten und landesweiten Regeln aller 16 Bundesländer sowie reproduzierbarer Osterberechnung
- bestehender Schaaf-Mandant auf Sachsen vorkonfiguriert; das Bundesland ist versionsgeschützt durch Administration oder Geschäftsführung änderbar
- Feiertage setzen das Tagessoll vor der Stundenkontoberechnung auf null; tatsächliche Feiertagsarbeit bleibt als positive Kontobewegung sichtbar
- örtliche und betriebliche freie Tage mit Pflichtgrund, idempotenter Client-UUID, unveränderlicher Anlage und begründeter Aufhebungshistorie
- eigener Jahreskalender im Mitarbeiter-Stundenkonto und gemeinsame Kalenderverwaltung in der Büro-Jahresübersicht
- eigenes fortlaufendes Stundenkonto in der bestehenden Wochenansicht mit aktuellem Saldo, Jahres-Soll und -Ist, Abwesenheitsgutschriften und zwölf Monatszeilen
- kompakte Büro-Jahresübersicht aller aktiven Mitarbeiter mit Kontostand, Resturlaub, offenen Urlaubsanträgen und genehmigtem Überstundenabbau
- jahresbezogener Urlaubsanspruch in ganzen oder halben Tagen sowie getrennte Versionsprüfung für Stundenkonto-Profil und Kalenderjahr
- unveränderliche, idempotente Startsaldo-, Korrektur- und Auszahlungsbuchungen mit Pflichtbegründung und Gegenbuchungsprinzip
- reproduzierbare Tagesberechnung bis einschließlich gestern: Arbeit plus freigegebene Abwesenheitsgutschrift minus eingefrorenes oder konfiguriertes Soll
- Rollen- und Mandantenschutz: eigenes Konto für jeden, firmenweite
  Gesamtübersicht nur für Büro, Geschäftsführung und Administration sowie
  Änderungen am Stundenkonto ausschließlich durch Administration oder Geschäftsführung
- eigene Abwesenheitsanträge für ganze oder halbe Tage mit Urlaub, Überstundenabbau, Freistellung, Krankheit, Lehrgang, Berufsschule und weiteren Arten
- zweistufige Prüfung mit Büroentscheidung vor der verbindlichen Freigabe durch die Geschäftsführung sowie technisch erzwungener Vier-Augen-Regel
- unveränderliche Antrags- und Entscheidungshistorie mit Begründung, Versionskonfliktschutz, RLS, Mandantentrennung und Löschschutz in Migration 033
- freigegebene Abwesenheiten in persönlicher Woche, Büro-Wochenplanung und Tageslage; ganztägig abwesende Mitarbeiter werden nicht als frei verfügbar geführt
- konfliktfeste Verbindung von Abwesenheit und Einsatzplanung: bestehende Einsätze sperren die Volltagsfreigabe, freigegebene Volltage sperren neue oder verschobene Einsätze
- Tageslage für Büro und Disposition mit eingeplanten und freien Feldmitarbeitern, laufenden Arbeitstagen und offenen Zeitprüfungen
- geplante Einsatzdauer und konkrete Arbeitsanweisung beim Anlegen, Bearbeiten, in der Wochenplanung und im mobilen Arbeitstag
- Mitarbeiterstammdaten mit optionaler Telefonnummer und E-Mail sowie direkte Kontaktaktionen im mobilen Baustellenteam
- mobile Baustellenakte übernimmt Startzeit, Dauer und Arbeitsanweisung aus dem eigenen Tageseinsatz
- Schnellaktionen am heutigen Einsatz für Navigation, Baustellenakte und den vorgezogenen Bericht des verantwortlichen Mitarbeiters
- Bericht kann während des laufenden Einsatzes gespeichert werden, ohne dadurch automatisch eine Abfahrtsbuchung auszulösen
- mobile Aufgabenstatus mit Beginnen, Erledigen und Wiederöffnen sowie serverseitiger Prüfung von Tageszuweisung, Rolle, Mitarbeiterzuordnung, Statusfolge und Versionsstand
- vier direkte Büroaktionen am geöffneten Baustellen-Dashboard für Einsatz, Bericht, Dokument und Aufgabe mit automatischer Baustellenvorauswahl
- dokumentierter Abgleich öffentlicher Plancraft-Arbeitsmuster mit klarer Übernahme-, Später- und Nicht-übernehmen-Entscheidung
- Login-Darstellung mit ursprünglicher Feldhöhe und korrekt positionierter Passwortanzeige wiederhergestellt
- große Stundenzettel-Anzeige auf Netto-Arbeitszeit umgestellt; Pausen und Unterbrechungen bleiben getrennt nachvollziehbar
- eigener Wochen-Stundenzettel mit Tageskarten, Wochensummen und allen wirksamen Buchungen
- eigene synchronisierte Zeitbuchungen können mit neuer Uhrzeit und Pflichtbegründung zur Korrektur eingereicht werden
- Zeitkorrekturen werden an der betroffenen Buchung auf Start oder in der Woche geöffnet und im Stundenzettel geprüft; nur eine Genehmigung ändert die Zeit und bewahrt das Original historisch
- abgeschlossene Tages-Stundenzettel werden ohne manuellen Einreich-Schritt automatisch im Büro sichtbar, können dort freigegeben und anschließend als abgerechnet gesperrt werden
- auch nach der Abrechnung bleibt ein begründeter Korrekturantrag möglich; normale neue Buchungen bleiben gesperrt
- Mandanten-, Eigentümer-, Tages-, Zeitreihenfolge- und Baustellenfolgeprüfung schützen Antrag und Entscheidung serverseitig
- freie Baustellenwahl am aktuellen Tag mit Vorschlag der Planung, Auswahl einer anderen Baustelle und nachvollziehbarer Feldanlage fehlender Baustellen
- fehlende Zeitbuchungen können begründet ergänzt und falsche Buchungen begründet als ungültig markiert werden; Originale werden nicht gelöscht
- automatische Büroprüfung aller laufenden und abgeschlossenen Arbeitstage mit Plausibilitätswarnungen
- Excel-Stundenzettelexport nach Zeitraum, Mitarbeiter und Status einschließlich vollständiger Buchungs- und Korrekturhistorie
- Büro-Wochenprüfung nach Monteur gruppiert, mit kompakten Tagesaktionen und sichtbarer Arbeitsstundensumme
- spontaner Einsatz kann fehlenden Kunden, fehlendes Projekt und fehlende Baustelle in einem geführten Vorgang anlegen
- Excel-Stundenzettel mit Mitarbeiterübersicht, eigenem Datumsblatt und Arbeitsstundensumme pro Monteur
- persönlicher PDF- und Excel-Export für Mitarbeiter enthält ausschließlich eigene freigegebene oder abgerechnete Tage
- persönlicher A4-Stundenzettel mit Tageswerten, Baustellen, Mitarbeiter-Gesamtsumme und Unterschriftsfeldern
- navigierbare Wochenhistorie mit eindeutigem Freigabestatus sowie sichtbarer Soll- und Mehrzeit
- Bautagesbericht und Montageschein mit Teamstunden, lokaler Entwurfssicherung, Vollständigkeitsprüfung und strukturierten Zusatzangaben in der finalen PDF
- flache durchsuchbare Baustellenablage ohne sichtbare Projektebene; neue Baustellen werden direkt einem vorhandenen oder neuen Kunden zugeordnet
- auf Kunde und Baustelle reduzierte Excel-Importvorlage mit eindeutiger Anleitung und automatischer interner Zuordnung

- Phase 0: Vision, Anforderungen, Rollenmodell und ER-Struktur mit 20 Kerntabellen
- GitHub-Projektbasis und verbindliche Entwicklungsregeln
- lokale Docker-Struktur für PostgreSQL, pgAdmin, MinIO und n8n
- sichere Trennung zwischen Vorlage `.env.example` und lokaler `.env`
- Migration 001 `companies`
- automatischer Firmennummernkreis
- Status aktiv/inaktiv mit automatischem Deaktivierungszeitpunkt
- Schutz gegen fachliches Hartlöschen
- vorbereitete Row-Level-Security-Policy für den eigenen Mandanten
- Seed-Datensatz Schaaf Elektro GmbH
- SQL-Abnahmetest und GitHub-CI-Workflow
- Backup- und Restore-Befehle vorbereitet
- Migration 002 `users` mit Personalnummer, optionaler E-Mail, Aktivhistorie und Passwort-Hash-Feld für die spätere API
- Migration 003 `roles` und `user_roles` mit mehreren historisierten Rollen je Benutzer
- sichtbare Standardrollen Geschäftsführer, Administrator, Büro/Disposition, Projektleiter, Vorarbeiter und Monteur; frühere Organisationsrollen bleiben kompatibel
- Admin-Vollzugriff, firmenübergreifender Fremdschlüsselschutz und erzwungene Row Level Security für die API-Rolle
- erste dokumentierte und mobiloptimierte PWA-Vorschau für Login und Dashboard
- lokaler PWA-Smoke-Test und GitHub-Pages-Workflow
- Migration 004 `customers` mit automatischer Kundennummer, Privat-/Firmenkunde, Debitorennummer, Archivierung und Dubletten-Zusammenführung
- Migration 005 `customer_contacts` mit Hauptkontakt und festen Zuständigkeiten
- Migration 006 `customer_locations` mit Standortnummer, Adresse, optionalem Geocoding, Zugangshinweisen und Rechnungsstandort
- Migration 007 `projects` mit Jahresnummer, Status, Priorität, mehreren Standorten und Verantwortlichen
- Migration 008 `construction_sites` mit Jahresnummer, flachen Bereichen, Status „im Verzug“, QR-Code und Pinnwand
- durchgehende Mandanten-Fremdschlüssel, erzwungene RLS-Regeln, Historie und Löschschutz für Migrationen 004 bis 008
- SQL-Abnahmetests für jede Migration sowie automatischer Backup-/Restore-Test
- Mandantenschutz und Rollentrennung werden in den SQL-Abnahmetests unter den
  eingeschränkten Datenbankrollen `schaefchen_api` und
  `schaefchen_platform_api` geprüft, weil die Policies für den
  Tabelleneigentümer bewusst nicht erzwungen werden
- der Service Worker und die Zeitberechnung der PWA sind zu 100 Prozent durch
  ausgeführte Tests abgedeckt; die Zeitberechnung liegt als gemeinsamer Kern in
  `frontend/core/work-time.js` und wird von `app.js` als Modul importiert
- die Plattformverwaltung ist im PostgreSQL-Integrationstest breit abgedeckt
  (Firmen, Module, Tarife, Verträge, Plattformadministratoren, Firmenkonten,
  Registrierungen, Support, Systemstatus, Fehlergruppierung, Versionen,
  Mitteilungen, Backups, Datenschutzanfragen mit Zwei-Personen-Freigabe);
  `api/src` erfüllt eine in der GitHub-Prüfung erzwungene Mindestabdeckung
  von 81 Prozent Zeilen, 71 Prozent Zweigen und 91 Prozent Funktionen
  (`make api-coverage`)
- GitHub Pages aktiviert und öffentliche PWA erfolgreich veröffentlicht
- Migration 009 `site_assignments` mit mehreren geordneten Baustellen pro Tag, Freigabe und Änderungshistorie
- Migration 010 `site_supervisors` mit mehreren Vorarbeitern, Hauptverantwortung und automatischer Übergabe
- Migration 011 `work_days` mit individuellem Wochensoll, versionierter Berechnung und Abrechnungssperre
- Migration 012 `time_entries` mit Offline-ID, Dublettenschutz, unveränderlichen Originalen und Korrekturworkflow
- automatische Berechnung von Pause, Arbeitszeit, Fahrtzeit und Mehrarbeit
- SQL-Abnahmetests für Planung, Vorarbeiter, Arbeitstage, Zeitereignisse und Mandantentrennung
- interaktive PWA-Demo für den vollständigen Monteur-Arbeitsfluss mit lokaler Speicherung
- Migration 013 `user_sessions` mit Ablauf, Widerruf, Löschschutz und ausschließlich gehashten Tokens
- Personalnummer-Login mit `scrypt`, konstantem Fehlerbild und begrenzten Fehlversuchen
- `HttpOnly`-/`SameSite=Strict`-Sitzungscookie und exakter CORS-Herkunft
- serverseitige Auflösung von Firma, Benutzer und aktiven Rollen
- getrennte technische Login-Rolle ohne eigene Tabellenrechte
- API-Endpunkte für Sitzung, eigenen Arbeitstag und idempotente Offline-Zeitbuchungen
- API-Unit-Tests sowie echter PostgreSQL-Integrationstest im GitHub-Workflow
- Migration 014 und einmalige schlüsselgeschützte Admin-Ersteinrichtung
- API-Endpunkt für eigene freigegebene Tageseinsätze
- echter PWA-Login mit benutzergetrennter Offline-Warteschlange und Synchronisation
- gemeinsame statische PWA-/API-Auslieferung mit Browser-Sicherheitsheadern
- Produktionscontainer und Render-Blueprint mit automatischem Migrationsstart
- Render-kompatible Trennung zwischen nicht privilegiertem Datenbankeigentümer und RLS-gebundener API-Rolle
- rollenabhängige mobile Verwaltung für Mitarbeiter, Baustellen und freigegebene Tageseinsätze
- vereinfachte Baustellenanlage, die Kunde, Standort und Projekt konsistent in einer Transaktion erzeugt
- verpflichtender persönlicher Passwortwechsel nach der Übergabe eines Mitarbeiter-Startpassworts
- API- und Oberflächenprüfung für Admin und gleichberechtigte Organisationsrollen im PostgreSQL-Integrationslauf
- selbstständige iOS-PWA-Cache-Reparatur ohne Löschen lokaler Offline-Fachdaten
- mobile Wochenplanung Montag bis Freitag mit allen Einsätzen
- begründetes Verschieben und Stornieren von Einsätzen mit vollständiger Änderungshistorie
- XLSX-Wochenplanimport für das vorhandene Baustellenplan-Format mit sicherer Vorschau
- ausschließliche Übernahme eindeutiger X-Zuweisungen; Abwesenheiten und Sonderkürzel bleiben unberührt
- Schutz bestehender Mitarbeitertage sowie serverseitige Wiederholungs- und Größenprüfung
- Excel-Baustellenlistenimport mit eigener Vorlage, Vorschau und zeilengenaue Fehleranzeige
- Wiederverwendung eindeutiger Kunden und Schutz vor doppelten aktiven Baustellennamen
- ausdrückliche Auswahl für unbekannte Mitarbeiter- und Baustellenbezeichnungen im Wochenplan
- verbindliche modulare Produktvision mit gemeinsamem Datenbestand und optionalen Spezialmodulen
- normaler Login nur mit Personalnummer und Passwort; die eingerichtete Firmennummer bleibt im Hintergrund
- getrennte Ansichten für Live-Arbeitstag, Woche und Verwaltung
- Live-Übersicht mit Status, aktueller Baustelle, Statusbeginn, Arbeitszeit und Vorarbeiterstatus
- gegliedertes Baustellen-Dashboard für Mitarbeiter, Berichte, Dokumente, Aufgaben und Material; weitere Module erscheinen erst nach Aktivierung
- Migration 016 mit neuem Betriebsrollenmodell und differenzierten Berechtigungsgrundlagen
- vereinfachte Arbeitskarte ohne doppelten Live-Block sowie versionierte PWA-Assets gegen gemischte iPhone-Cache-Stände
- getrennte mobile Anlage von Kunden, Projekten und Baustellen entlang der verbindlichen Hierarchie
- aufklappbare Betriebsstruktur Kunde → Projekt → Baustelle mit direktem Einstieg ins Baustellen-Dashboard
- serverseitige Prüfung, dass Projekt und Baustelle zu aktiven Datensätzen desselben Mandanten gehören
- integrierte Planungsbereiche: Excel-Wochenplan innerhalb der Einsatzplanung und Excel-Baustellenliste innerhalb der Baustellenplanung
- rollenabhängige Hauptnavigation: Planer erreichen Einsätze und Baustellen direkt; Monteure behalten Start, Woche und Mehr
- Mitarbeiterverwaltung und Einstellungen bleiben getrennt unter Mehr
- Excel-Wochenplan dauerhaft direkt unter „Einsatz freigeben“; Excel-Baustellenimport dauerhaft direkt unter „Baustelle anlegen“
- durchsuchbare Baustellenverwaltung mit Filtern für aktive, abgeschlossene und archivierte Baustellen
- geschützte Bearbeitung von Baustellenname, Monteurauftrag, Adresse und Status mit Versionskonfliktschutz
- Abschluss und Archivierung werden blockiert, solange aktuelle oder zukünftige Einsätze bestehen
- dauerhaft sichtbare Kunden- und Projektlisten mit Suche, Statusfilter und Bearbeitungsformular
- geschützte Statuswechsel: Kunden mit aktiven Projekten und Projekte mit aktiven Baustellen bleiben aktiv
- Versionskonfliktschutz für Kunden-, Projekt- und Baustellenänderungen
- Migration 017 mit zentralen Dokumentmetadaten, einmaligem Dateiinhalt und mehrfachen Verknüpfungen zu Kunde, Projekt und Baustelle
- SHA-256-Dublettenschutz: identische Dateien werden ohne Kopie mit weiteren Fachebenen verknüpft
- sicherer Upload für PDF, Bild, Text, Excel und Word bis 5 MB sowie geschützter Download
- Dokumentarchivierung mit Versionskonfliktschutz, Löschschutz und vollständiger Mandantentrennung
- sichtbarer Dokumentenbereich innerhalb der Baustellenverwaltung sowie Dokumentlisten im Baustellen-Dashboard
- Migration 018 mit serverseitiger Zuordnung des originalen Schaaf-Elektro-Firmenlogos
- getrennte Anzeige von Schäfchen-Softwaremarke und Firmenlogo im Login sowie im App-Kopfbereich
- Firmenlogo im Offline-App-Cache und sicher aus dem Sitzungsmandanten abgeleitete Logo-URL
- Migration 019 stabilisiert die getrennten V1-/V2-Vertraege der Ersteinrichtung
- sicherer Produktions-Vorabcheck repariert den kurzzeitig veroeffentlichten V1-Logovertrag vor den normalen Migrationen
- CI prueft den echten Upgradepfad vom betroffenen Produktionsstand bis zum erfolgreichen Neustart
- verbindlicher Produktfokus auf Elektrobetriebe bei später erweiterbarem gemeinsamen Kern
- abgeglichener, phasenweiser Umsetzungsplan aus dem Projekt-GPT „Render für Web-App Hosting“
- Migration 020 für Baustellenaufgaben mit Priorität, Mitarbeiterzuweisung, Fälligkeit, Status und Abschlusszeitpunkt
- Migration 021 für Baustellenmaterial mit Menge, Einheit und nachvollziehbaren Statusstufen
- Migration 022 für nummerierte Montage- und Bautagesberichte aus digitaler Eingabe, Originalfoto oder Diktat
- Aufgaben-, Material- und Berichtsbereiche direkt im thematisch gegliederten Baustellen-Dashboard
- fotografierte Papierberichte verwenden das zentrale Ein-Dokument-Prinzip und bleiben mit der Baustelle verknüpft
- ruhige mobile Gestaltung nach den festgelegten Spezifikationen; nicht aktivierte Platzhalterbereiche wurden ausgeblendet
- RLS, Mandanten-Fremdschlüssel, Versionsschutz, Löschschutz sowie SQL-, API- und Oberflächentests für alle drei Module
- Migration 023 für doppelte Touch-Unterschrift, historische Firmen-/Auftragssnapshots und unveränderliche Abschlussdokumente
- Montage- und Bautagesberichte lassen sich nach Mitarbeiter- und Auftraggeberunterschrift kontrolliert abschließen
- serverseitig erzeugte PDF-Ausgabe mit Firmenlogo, Kunde, Projekt, Baustelle, Berichtsdaten und beiden Unterschriften
- freigegebene PDFs werden einmal zentral gespeichert und automatisch mit Kunde, Projekt und Baustelle verknüpft
- freigegebene Berichte und ihre Abschluss-PDF bleiben technisch unveränderlich
- Migration 024 verbindet die tägliche Einsatzplanung eindeutig mit der mobilen Berichtsverantwortung
- pro Baustelle und Tag kann genau ein eingeteilter Vorarbeiter den Montage- oder Bautagesbericht übernehmen
- normale Monteure können keine mobilen Baustellenberichte erzeugen; Firma, Rolle, Einsatz, Baustelle und Datum werden serverseitig geprüft
- beim Verlassen einer berichtspflichtigen Baustelle fordert Schäfchen zuerst den Bericht an und blockiert auch serverseitig eine verfrühte Abfahrtsbuchung
- mobile Berichte und Zeitbuchungen bleiben offline-fähig; der Bericht wird mit eigener Idempotenz-ID vor der Abfahrtsbuchung synchronisiert
- Einsatzplanung und Wochenübersicht zeigen die Vorarbeiter-/Berichtspflicht sichtbar und erlauben begründete Änderungen
- der Details-Knopf des heutigen Einsatzes öffnet eine echte mobile Baustellenakte statt eines Hinweises
- Arbeitsauftrag, Navigation, Mitarbeiter, Aufgaben, Berichte, Dokumente, Fotos und Material sind als getrennte ruhige Themenkarten sichtbar
- Monteure und Vorarbeiter dürfen nur eine für den betreffenden Tag freigegebene Baustelle öffnen; Planungsrollen behalten mandantenweit Zugriff
- Monteure sehen eigene und allgemeine Aufgaben, Vorarbeiter zusätzlich das vollständige Baustellenteam und alle Baustelleninhalte
- direkter Kamera-Upload für Baustellenfotos mit zentraler Ein-Dokument-Speicherung und geschütztem Abruf
- zuletzt geladene Baustellenmetadaten bleiben für die Ansicht ohne Verbindung auf dem Gerät verfügbar
- Migration 025 ergänzt Montage- und Bautagesberichte um ausgeführte Leistungen, Behinderungen, offene Punkte und geprüfte Mitarbeiterstunden
- die mobile Berichtsmaske übernimmt das eingeplante Baustellenteam und erzeugt eine entsprechend gegliederte Abschluss-PDF
- Mitarbeiter können mit Versionskonfliktschutz bearbeitet und einer anderen Betriebsrolle zugeordnet werden
- Migration 026 unterscheidet manuelle Vorarbeiterplanung von automatischer Berichtsverantwortung
- ist nur ein Mitarbeiter an einer Baustelle eingeplant, übernimmt er dort automatisch die Vorarbeiter- und Berichtsfunktion; bei einer Teamänderung wird die automatische Funktion wieder aufgehoben
- Migration 027 erlaubt mehrere unveränderliche Arbeitsblöcke desselben Mitarbeiters am selben Tag
- nach Feierabend kann der Arbeitstag direkt erneut gestartet werden; Unterbrechungen zwischen den Blöcken zählen nicht als Arbeitszeit
- API, Offline-Synchronisation, Live-Stundenzettel und Tagesberechnung verwenden gemeinsam die Rechenregel Version 2
- Migration 028 ergänzt unveränderliche, mandantengetrennte Baustellennotizen mit sicherer Archivierungsgrundlage
- Büro und berechtigt eingeplante Mitarbeiter sehen denselben thematischen Notizbestand direkt in der Baustellenakte
- wichtige Hinweise werden hervorgehoben; Verfasser und Erstellungszeitpunkt bleiben nachvollziehbar
- eine Client-UUID verhindert doppelte Notizen bei wiederholtem mobilen Absenden
- Migration 029 schafft die historische Ausgangsbasis für optionale Elektro-Module
- Migration 040 überführt alle Firmenmodule in die ausschließlich durch
  Plattformrollen änderbare, versionsgeschützte Entitlement-Historie
- deaktivierte oder noch nicht vollständig angebundene Module erzeugen keine leeren Menüpunkte
- Migration 030 begrenzt die Modulplanung verbindlich auf VDE und DGUV; LWL und KNX gehören nicht zum Projektumfang
- Migration 031 erlaubt nachvollziehbare Zeitkorrekturen an abgerechneten Tagen ohne die Abrechnungssperre für neue Buchungen aufzuweichen
- Migration 032 vervollständigt die Zeiterfassung um Feldbaustellen, spontane Einsatzwahl, Ergänzungen, Ungültigmarkierungen, automatische Büroprüfung und Rechenregel Version 3
- Migration 033 ergänzt zweistufig geprüfte Abwesenheiten mit unveränderlicher Historie und konfliktfester Verknüpfung zur Einsatzplanung
- Migration 034 ergänzt Stundenkonto-Profile, kalenderjahrbezogene Urlaubsansprüche, unveränderliche Korrekturbuchungen und die mandantengeschützte Tagesberechnung
- Migration 035 ergänzt Mandantenkalender, gesetzliche Feiertagsregeln, betriebliche freie Tage und ihre verbindliche Wirkung auf die Tagesberechnung
- Migration 036 integriert VDE-Prüfungen, unveränderliche Vollversionen, V15-Originale und zentrale Abschlussdokumente ohne doppelte Stammdaten
- Migration 037 vervollständigt Baustellenakte, Dokumentfreigabe, QR-Zugang und Berichtshistorie
- Migration 038 ergänzt persistente Teamvorlagen für die Desktop-Plantafel

## Noch zu prüfen

- grüne GitHub-CI des exakten V0.42.0-Commits einschließlich Migrationen
  039–044, SQL-Tests und PostgreSQL-Integration
- reale iPhone-, Android-, Chrome-, Edge- und vollständige Offline-Abnahme
- Last- und Datenmengentest mit 10.000 Mitarbeitern und mehrjährigen Buchungen
- freigegebene Zielplattform, getrennte Staging-/Produktionsumgebungen,
  dauerhafte Backups, PITR, Wiederherstellungsprobe und Alarmierung
- Upload-Schadsoftwareprüfung, Rate Limits, Passwortzurücksetzung und
  dokumentierter Admin-Notzugang
- externe Datenschutz-, AVV-, TOM-, Impressums- und Vertragsprüfung
- vierwöchiger Pilot sowie Onboarding-, Support-, Störungs-, Preis- und
  Lizenzprozess
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden
  bewusst keine Daten erfunden

Die vollständigen Gates mit Priorität und Abschlussnachweis stehen in
[`ROADMAP_ACCEPTANCE.md`](ROADMAP_ACCEPTANCE.md) und
[`BACKLOG.md`](BACKLOG.md). Diese Punkte werden nicht als bestanden behandelt,
solange der reale Nachweis fehlt.

## Nächster Entwicklungsschritt

Nach grüner V0.42.0-CI folgt der Fahrplan-Schritt V0.50. Die VDE-Integration ist
bereits technisch vorhanden; deshalb wird V0.50 als formale
Integrationsabnahme genutzt: gemeinsamer Vertrag, Rollen- und
Deaktivierungsgrenzen, V15-Migration, Messdatenhistorie und zentrale
Abschlussdokumente werden gegen die Fahrplanmatrix geschlossen.

Parallel bleiben die Produktions-, Geräte-, Last-, Rechts- und Pilot-Gates
verbindlich offen. Sie dürfen vor echten Betriebsdaten beziehungsweise V1.0
nicht übersprungen werden.

DGUV gehört laut verbindlichem Fahrplan erst in die Reihenfolge nach V1.0 und
ist ausdrücklich nicht der nächste Entwicklungsschritt.

Die öffentliche GitHub-Pages-PWA bleibt eindeutig als lokale Demo
gekennzeichnet; die echte Anmeldung läuft ausschließlich auf der gemeinsamen
Online-Adresse.
