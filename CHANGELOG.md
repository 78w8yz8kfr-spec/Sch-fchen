# Changelog

Alle wesentlichen Änderungen an Schäfchen werden in dieser Datei dokumentiert.

## [Unreleased]

### V0.33.0 – Persönlicher PDF-Stundenzettel und einfache Baustellen

- Mitarbeiter laden ihre eigenen freigegebenen oder abgerechneten Stundenzettel jetzt direkt als übersichtliches A4-PDF oder weiterhin als Excel-Datei herunter
- das persönliche PDF enthält Tageszeiten, Baustellen, Status, Soll-, Arbeits-, Pausen-, Fahrt- und Mehrzeit sowie eine klare Gesamtsumme und Unterschriftsfelder
- der Büro-PDF-Export beginnt für jeden Monteur auf einer eigenen Seite und behält die Sortierung nach Mitarbeiter und Datum bei
- die Baustellenansicht ist eine einzige flache, durchsuchbare Liste ohne sichtbare Projektebene und ohne doppelte Verwaltungsordner
- neue Baustellen benötigen in der Oberfläche nur Kunde, Baustellenname, Aufgabe und Adresse; die notwendige interne Datenbankzuordnung übernimmt Schäfchen automatisch
- die Baustellen-Importvorlage wurde auf Kunde und Baustelle reduziert, neu gegliedert und mit einer kurzen Anleitung versehen
- Bautagesberichte und Montagescheine zeigen in der finalen PDF nur noch Kunde und Baustelle statt einer zusätzlichen Projektzeile

### V0.32.0 – Persönlicher Stundenzettelexport und Wochenvergleich

- Mitarbeiter können ausschließlich ihre eigenen vom Büro freigegebenen oder bereits abgerechneten Stundenzettel als Excel-Datei exportieren
- der persönliche Endpunkt erzwingt Mitarbeiter- und Mandantentrennung serverseitig; unfertige oder nur abgeschlossene Tage gelangen nicht in die Datei
- die Wochenansicht wechselt zwischen vergangenen Wochen und der aktuellen Woche, ohne zukünftige leere Wochen anzubieten
- Status zeigen eindeutig „Freigegeben“ beziehungsweise „Abgerechnet“ und kennzeichnen exportierbare Tage
- Wochensumme und Tageskarten zeigen zusätzlich Soll- und Mehrzeit; der Export meldet Server- und Zeitraumfehler direkt in der Oberfläche

### V0.31.0 – Zeiterfassung, Berichte und Baustellenablage aufgeräumt

- die Büro-Wochenprüfung gruppiert Stundenzettel nach Monteur und zeigt Tage, Wochenstunden, Warnungen sowie kompakte Freigabe- und Abrechnungsaktionen ohne überdeckende Schaltflächen
- beim spontanen Einsatz können Monteure einen vorhandenen Kunden und ein vorhandenes Projekt verwenden oder Kunde, Projekt und Baustelle vollständig in einem geführten Ablauf anlegen
- der Excel-Export enthält eine Mitarbeiterübersicht, ein eigenes nach Datum sortiertes Tabellenblatt je Monteur, sichtbare Arbeitsstundensummen und weiterhin die unveränderliche Buchungshistorie
- Bautagesbericht und Montageschein erhalten Teamstundensumme, Vollständigkeitsprüfung, lokalen Entwurf sowie optionale Angaben zu Witterung, Material, Geräten, Absprachen, Behinderungen, offenen Punkten und Vorfällen
- die freigegebene Berichts-PDF übernimmt alle strukturierten Zusatzangaben und verwendet die eindeutige Bezeichnung Montageschein
- der Bereich Baustellen zeigt Kunde → Projekt → Baustelle als durchsuchbare Hauptablage; doppelte Verwaltungslisten entfallen und Formulare erscheinen nur noch zum gezielten Anlegen oder Bearbeiten
- zentrale Dokumentablage ist standardmäßig eingeklappt; häufige Aktionen zum Anlegen und Bearbeiten liegen direkt am passenden Kunden oder Projekt

### V0.30.0 – Zeiterfassung vollständig

- beendete Arbeitstage erscheinen ohne zusätzlichen Einreich-Schritt automatisch im Büro; die Oberfläche bündelt den Ablauf in „In Arbeit“, „Abgeschlossen“ und „Abgerechnet“
- Büro, Projektleitung und Geschäftsführung sehen alle laufenden und abgeschlossenen Stundenzettel samt Warnhinweisen und können abgeschlossene Tage direkt prüfen und abrechnen
- Mitarbeiter erhalten die geplante Baustelle als Vorschlag, dürfen eine andere vorhandene Baustelle wählen oder eine fehlende Baustelle mit Projekt und Adresse zur Bürobestätigung anlegen
- fehlende Buchungen lassen sich mit Zeitpunkt, Buchungsart, Baustelle und Pflichtgrund ergänzen; falsche Buchungen werden nachvollziehbar als ungültig beantragt statt gelöscht
- Zeitkorrektur, Ergänzung und Ungültigmarkierung verwenden denselben Freigabeworkflow und bewahren Original, Grund, Entscheidung und Prüfer dauerhaft
- Excel-Export für frei wählbare Zeiträume, Mitarbeiter und Status enthält Tageswerte, Warnhinweise und die vollständige Buchungshistorie
- automatische Pausen bleiben bei 3,5 Stunden mit 30 Minuten und ab 6 Stunden mit insgesamt 60 Minuten wirksam; Fahrtzeit zählt zur Arbeitszeit
- Migration 032, erweiterte API-/Validierungs-/PWA-/PostgreSQL-Tests und Rechenregel Version 3

### V0.29.0 – Stundenzettel prüfen und abrechnen

- Monteure reichen einen vollständig beendeten Tages-Stundenzettel direkt in der Wochenansicht zur Prüfung ein
- Büro und Geschäftsführung geben eingereichte Tage frei und sperren sie anschließend nachvollziehbar als abgerechnet
- Start- und Wochenansicht zeigen eindeutig Offen, Zur Prüfung, Freigegeben oder Abgerechnet
- nach Einreichung sind neue reguläre Buchungen ausgeschlossen; offene Korrekturen verhindern eine verfrühte Freigabe
- begründete Korrekturanträge bleiben auch nach der Abrechnung möglich, während das Original historisch erhalten bleibt
- neue Migration 031 trennt die erlaubte Korrekturanfrage von verbotenen neuen Buchungen an gesperrten Tagen

### V0.28.1 – Korrektur auch auf Start

- der rote Korrekturzugang steht wieder direkt an jeder synchronisierten Buchung im Start-Stundenzettel
- bereits eingereichte Änderungen zeigen dort eindeutig „Prüfung offen“
- die vollständige Korrekturmöglichkeit im Wochen-Stundenzettel bleibt zusätzlich bestehen

### V0.28.0 – Wochen-Stundenzettel

- neuer vollständiger Wochen-Stundenzettel mit Arbeit, Pause und Fahrt als Wochensumme
- Montag bis Sonntag werden als ruhige Tageskarten mit Status, Tageswerten und allen einzelnen Buchungen dargestellt
- Zeitkorrekturen können an der passenden Buchung im Wochen-Stundenzettel geöffnet werden
- Korrekturen erscheinen als kompakte mobile Eingabefläche; bis zur Prüfung bleibt die bisherige Uhrzeit sichtbar
- offene Korrekturen liegen für berechtigte Bürorollen direkt im Bereich Woche statt in der Einsatzplanung
- neuer geschützter Wochenendpunkt liefert die eigenen sieben Kalendertage einschließlich wirksamer Buchungen und Wochensummen

### V0.27.0 – Nachvollziehbare Zeitkorrekturen

- Mitarbeiter können eine synchronisierte eigene Zeitbuchung direkt im Stundenzettel mit neuer Uhrzeit und Pflichtbegründung zur Prüfung einreichen
- bis zur Entscheidung bleibt ausschließlich die unveränderte Originalzeit wirksam
- offene Korrekturen erscheinen mit alter und gewünschter Uhrzeit zur Prüfung im Stundenzettel
- Planung und Geschäftsführung können Anträge genehmigen oder ablehnen; Genehmigungen entwerten das Original historisch und berechnen den Stundenzettel neu
- API prüft Mandant, Eigentümer, Arbeitstag, Zeitreihenfolge und Baustellenfolge vor Antrag und Genehmigung
- Validierungs-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern den vollständigen Ablauf

### V0.26.1 – Modulumfang auf VDE und DGUV begrenzt

- LWL und KNX vollständig aus API, Modulplanung und aktueller Produktdokumentation entfernt
- nur VDE und DGUV bleiben als aktivierbare Elektro-Spezialmodule vorgesehen
- neue Migration 030 verhindert auch auf Datenbankebene neue LWL- oder KNX-Freigaben
- SQL-, API-, PostgreSQL- und Validierungstests an den verbindlichen Modulumfang angepasst

### V0.26.0 – Grundlage für optionale Elektro-Module

- firmenbezogene Modulfreigaben für VDE, DGUV, LWL und KNX
- Aktivierung ausschließlich durch Administration oder Geschäftsführung
- serverseitiger Mandantenfilter, Versionskonfliktschutz und unveränderliche Änderungshistorie
- deaktivierte und noch nicht fachlich angebundene Module bleiben vollständig aus der Oberfläche ausgeblendet
- Migration 029 sowie SQL-, API-, PostgreSQL- und Validierungstests

### V0.25.1 – Netto-Arbeitszeit im Stundenzettel

- die große rote Stundenzettel-Anzeige zeigt jetzt die tatsächliche Netto-Arbeitszeit
- Pausen und Unterbrechungen zwischen mehreren Arbeitsblöcken werden sichtbar von der Bruttozeit abgezogen
- Bruttozeit, Pause, Arbeit und Fahrt bleiben zur Kontrolle getrennt ausgewiesen
- PWA-Smoke-Test schützt die Nettoanzeige vor einer erneuten Verwechslung mit der Bruttozeit

### V0.25.0 – Gemeinsame Baustellennotizen

- eigener ruhiger Notizbereich direkt in jeder Baustelle statt einer globalen Aktivitätschronik
- Büro und berechtigt eingeplante Mitarbeiter lesen denselben mandantengetrennten Notizbestand
- kurze Hinweise können als wichtig markiert und mit Verfasser sowie Zeitpunkt angezeigt werden
- idempotente Speicherung verhindert doppelte Notizen bei wiederholtem Absenden
- Migration 028, RLS, Löschschutz sowie erweiterte SQL-, API-, PostgreSQL- und PWA-Tests

### V0.24.0 – Mehrere Arbeitsblöcke pro Tag

- nach Feierabend kann derselbe Arbeitstag mit einer großen Schaltfläche erneut gestartet werden
- jeder Arbeitsbeginn und jeder Feierabend bleiben als eigener unveränderlicher Zeitblock erhalten
- Unterbrechungen zwischen zwei Arbeitsblöcken zählen als Pause und nicht als Arbeitszeit
- Datenbank-Rechenregel Version 2 sowie erweiterte SQL-, API-, PostgreSQL- und PWA-Tests

### V0.23.0 – Mitarbeiter, Vorarbeiter und strukturierte Berichte

- Mitarbeiterstammdaten und Betriebsrollen lassen sich geschützt bearbeiten; parallele Änderungen werden über den Versionsstand erkannt
- manuell eingeplante Vorarbeiter werden technisch von der automatischen Verantwortung eines allein eingesetzten Monteurs unterschieden
- der einzige Mitarbeiter einer Baustelle übernimmt automatisch die Vorarbeiter- und Berichtsfunktion, ohne dauerhaft die Mitarbeiterrolle Vorarbeiter zu erhalten
- sobald das Team vergrößert wird, endet die automatische Vorarbeiterfunktion; ein manuell bestimmter Vorarbeiter bleibt verbindlich
- Montage- und Bautagesberichte erfassen ausgeführte Leistungen, Behinderungen, offene Punkte und die Stunden aller eingeplanten Mitarbeiter
- Mitarbeiter und Namen werden serverseitig gegen die Tagesplanung geprüft; Abschluss-PDFs übernehmen die strukturierte Gliederung
- neue Migrationen 025 und 026 sowie erweiterte SQL-, API-, PostgreSQL-, PDF- und PWA-Tests

### V0.22.0 – Mobile Baustellenakte

- der bisherige Details-Hinweis des Tageseinsatzes öffnet jetzt die echte Baustellenakte
- übersichtliche Themenkarten für Arbeitsauftrag, Mitarbeiter, Aufgaben, Berichte, Dokumente, Fotos und Material
- Monteure und Vorarbeiter dürfen ausschließlich am betreffenden Tag zugewiesene Baustellen öffnen; Planungsrollen behalten den vollständigen Zugriff
- Aufgaben werden für Monteure auf eigene und allgemeine Baustellenaufgaben begrenzt, während Vorarbeiter das gesamte Baustellenteam sehen
- Baustellenfotos können direkt aufgenommen werden und landen ohne Kopie im zentralen Dokumentenbestand
- die zuletzt geladene Baustellenübersicht bleibt als kleine Offline-Ansicht auf dem Gerät verfügbar
- PostgreSQL-Integrationstest für berechtigten und verbotenen Zugriff, Rollenunterschiede, Foto-Upload und geschützten Dateiabruf

### V0.21.0 – Mobile Vorarbeiterberichte

- tägliche Vorarbeiter- und Berichtsverantwortung direkt in der Einsatzplanung
- mobile Montage- oder Bautagesberichte beim Verlassen der Baustelle
- serverseitige Rollen-, Einsatz-, Baustellen- und Datumsprüfung sowie Abfahrtssperre ohne Pflichtbericht
- offline-fähige, idempotente Berichtsübertragung vor der zugehörigen Zeitbuchung
- Migration und automatisierte Tests für eindeutige Zuständigkeit und unverwechselbare Bericht-zu-Einsatz-Verknüpfung

### Hinzugefügt

- initiale Repository- und Ordnerstruktur
- Docker-Compose-Umgebung mit PostgreSQL, pgAdmin, MinIO und n8n
- Umgebungsvariablen-Vorlage ohne produktive Zugangsdaten
- Migration 001 für die SaaS-Mandantentabelle `companies`
- automatische Firmennummern, Aktivstatus, Deaktivierungszeitpunkt und Versionszähler
- vorbereitete Row-Level-Security-Policy für Mandantentrennung
- Schutz gegen hartes Löschen von Firmen
- erster Seed-Datensatz Schaaf Elektro GmbH
- SQL-Abnahmetest für Migration 001
- GitHub Actions für Compose- und Datenbankprüfung
- lokale Befehle für Migrationen, Seeds, Tests, Backup und Restore
- Architektur- und Projektstatusdokumentation
- Migration 002 für Benutzer mit Personalnummer-Login, Aktivhistorie und Mandantenschutz
- Migration 003 für anpassbare Rollen, historische Mehrfachzuweisungen und Standardrollen Admin, Büro, Vorarbeiter und Monteur
- eigene eingeschränkte Datenbankrolle `schaefchen_api` mit erzwungener Row Level Security
- automatische Pflege des Vorarbeiterstatus aus aktiven Rollenzuweisungen
- dokumentierte UI-Spezifikation für Login und Dashboard
- mobiloptimierte, installierbare PWA-Vorschau ohne vorgetäuschte Serveranmeldung
- PWA-Smoke-Test und GitHub-Pages-Veröffentlichungsworkflow
- Migration 004 für Privat- und Firmenkunden, automatische Kundennummern, Debitorennummern, Archivierung und Dubletten-Zusammenführung
- Migration 005 für mehrere Kundenansprechpartner, feste Zuständigkeiten und einen aktiven Hauptkontakt
- Migration 006 für Kundenstandorte mit automatischer Standortnummer, Adresse, optionalem Geocoding und Rechnungsstandort
- Migration 007 für Projekte mit Jahresnummer, Priorität, Status, Standort- und Verantwortlichenhistorie
- Migration 008 für Baustellen mit Jahresnummer, flachen Bereichen, QR-Code, Pinnwand und Statushistorie
- erzwungene Mandantentrennung und Löschschutz für die Auftragsgrundlage
- SQL-Abnahmetests für Migrationen 004 bis 008
- idempotente Doppelanwendung aller Migrationen in GitHub Actions
- automatischer PostgreSQL-Backup-/Restore-Abnahmetest
- technische Sprint-1-Dokumentation für Kunden, Projekte und Baustellen
- Migration 009 für mehrfache, geordnete Tagesbaustellen mit Freigabe und Änderungshistorie
- Migration 010 für mehrere Vorarbeiter, genau einen aktiven Hauptvorarbeiter und automatische Berichtsübergabe
- Migration 011 für individuelle Wochen-Sollzeiten, berechnete Arbeitstage und Abrechnungssperre
- Migration 012 für unveränderliche Offline-Zeitereignisse, Client-ID-Dublettenschutz und Korrekturanträge
- automatische Pausen-, Arbeits-, Fahr- und Mehrarbeitsberechnung mit versionierter Rechenregel
- SQL-Abnahmetests für Migrationen 009 bis 012 und erweiterte Backup-/Restore-Prüfung
- interaktive Sprint-2-PWA-Demo mit zwei Einsätzen, lokalem Stundenzettel und dauerhafter Gerätespeicherung
- vollständige Sprint-2-Dokumentation für Planung, Zeiterfassung, Korrekturen und Offline-Verhalten
- Schaaf-Elektro-Farbsystem in Rot, Schwarz und Weiß für PWA, App-Symbol und Browserdarstellung
- Migration 013 für ablaufende und widerrufbare Benutzersitzungen mit ausschließlich gehashten Tokens
- technische API-Login-Rolle ohne eigene Tabellenrechte und serverseitiger Mandantenkontext je Transaktion
- Node-API für Personalnummer-Anmeldung, Sitzungsprüfung, Abmeldung, eigenen Arbeitstag und Offline-Zeitbuchungen
- `scrypt`-Passwort-Hashing, sichere Cookies, Login-Sperre, exakte Herkunftsprüfung und begrenzte JSON-Anfragen
- idempotente Offline-Synchronisation mit Schritt-, Zeit-, Baustellen- und Zuweisungsprüfung
- Docker-API-Dienst, lokale API-Befehle und PostgreSQL-Integrationstest in GitHub Actions
- Migration 014 für eine einmalige, schlüsselgeschützte Admin-Ersteinrichtung
- gleicher HTTPS-Ursprung für installierbare PWA und API mit echtem Login
- mobile Offline-Warteschlange mit idempotenter Synchronisation und benutzergetrenntem Gerätespeicher
- API für freigegebene eigene Tageseinsätze und serverseitige PWA-Auslieferung mit Sicherheitsheadern
- Produktionscontainer, automatischer Migrationsstart und Render-Blueprint für Webdienst und PostgreSQL
- Render-Fix: Migrationseigentümer darf RLS für Schemaaufbau umgehen, während die API-Rolle weiterhin vollständig RLS-gebunden bleibt
- zusätzlicher CI-Migrationslauf mit einem nicht privilegierten Render-ähnlichen Datenbankeigentümer
- Render-kompatible Härtung der technischen Login-Rolle ohne verbotene Superuser-Attributänderung
- mobile Verwaltung unter „Mehr“ für Mitarbeiter, Kunden-/Projekt-/Baustellenpakete und freigegebene Einsätze
- serverseitige Rollenprüfung: Admin und Büro planen, ausschließlich Admin darf Bürokonten anlegen
- persönliche Startpasswort-Änderung bei der ersten Anmeldung neuer Mitarbeiter
- PostgreSQL-Integrationstest für Verwaltung, Rollentrennung, Passwortwechsel und sichtbare Mitarbeiterzuweisung
- iOS-Cache-Reparaturseite und netzwerkbevorzugte Navigation gegen dauerhaft veraltete PWA-Oberflächen
- Migration 015 für die gleichberechtigten Rollen Planer, Projektleiter und Assistenz der Geschäftsführung
- mobile Wochenplanung Montag bis Freitag mit allen Mitarbeitern und Einsätzen
- begründetes Verschieben und Stornieren von Einsätzen unter Erhalt der Änderungshistorie
- Versionsstand 0.8.0
- sicherer Excel-Import für Wochenpläne im vorhandenen Baustellenplan-Format
- Importvorschau für X-Zuweisungen mit eindeutiger Mitarbeiter- und Baustellenzuordnung
- Schutz bestehender Mitarbeitertage vor Überschreiben und Dublettenschutz bei Wiederholungen
- Erkennung von Abwesenheits- und Sonderkürzeln ohne automatische Übernahme
- Größen-, Dateityp- und Archivprüfung für hochgeladene XLSX-Dateien
- Versionsstand 0.9.0
- geschützter Excel-Import für mehrere Kunden-, Projekt- und Baustellenpakete
- herunterladbare Baustellen-Importvorlage mit Pflichtfeldern und PLZ-Textformat
- Vorschau für neue, bereits vorhandene und fehlerhafte Baustellenzeilen
- ausdrückliche Zuordnung unbekannter Mitarbeiter- und Baustellenbezeichnungen aus Wochenplänen
- Wiederverwendung eindeutig vorhandener Kunden und Schutz vor doppelten aktiven Baustellennamen
- Versionsstand 0.10.0
- verbindliche Produktvision für Schäfchen als modulare All-in-One-Unternehmenssoftware
- Migration 016 für Geschäftsführer, Administrator, Büro/Disposition, Projektleiter, Vorarbeiter und Monteur
- kompatibler Erhalt früherer Büro-, Planer- und Assistenzrollen ohne Neuanlage in der Oberfläche
- normaler Login nur mit Personalnummer und Passwort; Firmennummer bleibt nach der Einrichtung verborgen
- getrennte Start-, Wochen- und Mehr-Ansichten für ein ausschließlich live orientiertes Mitarbeiter-Dashboard
- kompakte Live-Anzeige für Status, Baustelle, Statusbeginn, Arbeitszeit und Vorarbeiterstatus
- gegliedertes Baustellen-Dashboard mit aufklappbaren Themenbereichen statt Aktivitätschronik
- dokumentiertes Ein-Dokument-Prinzip, Mandantenlogo-Grenze und modularer Ausbaupfad
- Versionsstand 0.11.0
- unruhigen, doppelten Live-Übersichtsblock wieder entfernt
- Statusbeginn und Arbeitszeit platzsparend in die bestehende Arbeitskarte integriert
- Vorarbeiterkennzeichnung erscheint nur für tatsächliche Vorarbeiter
- CSS und JavaScript werden versionsgebunden geladen, damit iPhones keine alte Gestaltung mit neuem HTML mischen
- Versionsstand 0.11.1
- getrennte Anlage von Firmen- und Privatkunden, Projekten und Baustellen
- eindeutige serverseitige Zuordnung Projekt → Kunde und Baustelle → Projekt mit Mandantenschutz
- mobile Betriebsstruktur mit aufklappbarer Hierarchie Kunde → Projekt → Baustelle
- Kunden- und Projektauswahl statt wiederholter Freitexteingabe bei der Baustellenanlage
- bestehender Excel-Schnellimport und Paket-Endpunkt bleiben kompatibel
- Versionsstand 0.12.0
- Excel-Wochenplan als Unterfunktion der Einsatzplanung gruppiert
- Excel-Baustellenliste als Unterfunktion der Baustellenplanung gruppiert
- Verwaltungsmenü von einzelnen Import-Hauptpunkten befreit
- Versionsstand 0.12.1
- direkte Navigationspunkte für Einsätze und Baustellen bei Planungsrollen
- rollenabhängige Navigation mit fünf Bereichen für Planer und unverändert drei Bereichen für Monteure
- Mehr auf Mitarbeiterverwaltung und ergänzende Einstellungen reduziert
- redundante zusätzliche Planungsebene entfernt
- Versionsstand 0.13.0
- separate Excel-Aufklappkarten aus Einsatz- und Baustellenplanung entfernt
- Dateiauswahl und Drag-and-drop ohne zusätzlichen Klick direkt sichtbar gemacht
- Excel-Import weiterhin mit sicherer Vorschau und ausdrücklicher Bestätigung
- Versionsstand 0.13.1
- roter Button „Baustelle anlegen“ bleibt unverändert als wichtigste manuelle Aktion erhalten
- kompakte, dauerhaft sichtbare Excel-Fläche direkt unter „Baustelle anlegen“ integriert
- Dateiauswahl und Vorlagenlink sofort sichtbar; Dateiname und Prüfung erst nach Auswahl eingeblendet
- Versionsstand 0.13.2
- „Einsatz freigeben“ bleibt als wichtigste manuelle Aktion unverändert erhalten
- Excel-Wochenplan dauerhaft und kompakt direkt unter „Einsatz freigeben“ integriert
- freigegebene Einsatzliste folgt erst nach manueller und Excel-Planung
- Versionsstand 0.13.3
- durchsuchbare Baustellenliste nach Name, Kunde, Projekt, Nummer, Adresse und Ort
- Statusfilter für aktive, abgeschlossene, archivierte oder alle Baustellen
- Baustellen-Dashboard mit sichtbarem Status und vollständiger Bearbeitungsmaske
- Änderung von Baustellenname, Monteurauftrag, Adresse und Status
- optimistische Versionsprüfung gegen unbeabsichtigtes Überschreiben paralleler Änderungen
- Schutz vor Abschluss oder Archivierung bei aktuellen und zukünftigen Einsätzen
- Reaktivierung abgeschlossener oder archivierter Baustellen bei aktivem Kunden und Projekt
- Versionsstand 0.14.0
- dauerhaft sichtbare Kunden- und Projektverwaltung getrennt von den jeweiligen Anlegeformularen
- Suche nach Kundenname, Nummer, Kontakt und Ort sowie Projektname, Nummer und Kunde
- Statusfilter für aktive und archivierte Kunden sowie laufende, abgeschlossene und archivierte Projekte
- geschützte Bearbeitung von Kundenstammdaten, Rechnungsadresse, Projektname, Kurztext und Status
- optimistische Versionsprüfung für Kunden und Projekte gegen paralleles Überschreiben
- Archivierung eines Kunden nur ohne aktive Projekte; Projektabschluss nur ohne aktive Baustellen
- aktive Auswahllisten und Betriebsstruktur blenden abgeschlossene oder archivierte Stammdaten aus
- Versionsstand 0.15.0
- Migration 017 für zentrale Dokumentmetadaten, getrennten Dateiinhalt und Verknüpfungen zu Kunde, Projekt und Baustelle
- Ein-Dokument-Prinzip mit SHA-256-Dublettenschutz und Wiederverwendung vorhandener Dateien ohne Kopie
- sicherer Upload von PDF, Bild, Text, XLSX und DOCX bis 5 MB sowie sitzungsgeschützter Download
- automatische Ableitung von Projekt und Kunde bei Dokumentzuordnung zu einer Baustelle
- Dokumentarchivierung und Reaktivierung mit Versionskonflikt-, Lösch- und Mandantenschutz
- sichtbare zentrale Dokumentverwaltung im Bereich Baustellen sowie Dokumente direkt im Baustellen-Dashboard
- Dokumentanzahl und direkter Einstieg aus Kunden- und Projektverwaltung
- Versionsstand 0.16.0
- Migration 018 für die serverseitige Firmenlogo-Zuordnung der Startfirma
- originales Schaaf-Elektro-Firmenlogo aus dem bestehenden VDE-Prüfprotokoll in Login und Kopfbereich
- getrennte Darstellung von Firmenlogo und unverändertem Schäfchen-Markenlogo
- Logo-URL ausschließlich aus der serverseitig aufgelösten Firma; Initial bleibt der neutrale Fallback
- Firmenlogo im Offline-App-Cache und als gemeinsames Original für spätere PDFs und E-Mails
- Versionsstand 0.17.0
- Produktions-Upgradepfad für den kurzzeitig erweiterten alten Setup-Funktionsvertrag abgesichert
- Migration 019 prüft die stabilen getrennten V1-/V2-Verträge der Ersteinrichtung
- CI bildet den betroffenen Produktionsstand nach und prüft Vorabreparatur, Migrationen und Neustart
- Versionsstand 0.17.1
- Produktfokus auf Elektrobetriebe präzisiert; eine spätere Gewerkeerweiterung bleibt auf Basis des gemeinsamen Kerns möglich
- direkter Kamerazugriff „Lieferschein fotografieren“ im Dokumentbereich einer geöffneten Baustelle
- Lieferschein-Foto wird nur einmal zentral gespeichert und automatisch zu Baustelle, Projekt und Kunde verknüpft
- Lieferscheine serverseitig auf JPG, PNG und WebP bis 5 MB begrenzt
- geordneter Umsetzungsplan aus dem Projekt-GPT „Render für Web-App Hosting“ dokumentiert
- Versionsstand 0.18.0
- Migration 020 für priorisierte und optional zugewiesene Baustellenaufgaben mit Fälligkeit und Abschlussstatus
- Migration 021 für Materialbedarf und die Statusfolge benötigt, bestellt, vor Ort und verbraucht
- Migration 022 für nummerierte Montage- und Bautagesberichte mit digitaler, fotografierter oder diktierter Erfassung
- echte Aufgaben-, Material- und Berichtsaktionen direkt im Baustellen-Dashboard ohne zusätzliche Hauptnavigation
- fotografierte Papierberichte werden einmal im zentralen Dokumentenbestand gespeichert und mit dem Bericht verknüpft
- ruhige Karten-, Formular- und Statusgestaltung nach den vereinbarten mobilen Designspezifikationen
- ausgeblendete Platzhalter für noch nicht aktivierte Baustellenmodule
- SQL-Abnahmetests, API-Integrationstest und PWA-Smoke-Test für die neuen Arbeitsmodule
- Versionsstand 0.19.0
- ursprüngliche mobile Höhe der Loginfelder und Position der Passwortanzeige wiederhergestellt
- neuer Frontend-Cache für die sofort sichtbare Korrektur auf installierten Geräten
- Versionsstand 0.19.1
- Migration 023 für Berichtfreigabe, zwei Unterschriften, historische Snapshots und Abschlussdokument
- mobile Touch-Unterschriften für Mitarbeiter beziehungsweise Vorarbeiter und Auftraggeber
- serverseitige, unveränderliche PDF-Ausgabe mit Firmenlogo und vollständigem Auftragsbezug
- automatische zentrale PDF-Verknüpfung zu Kunde, Projekt und Baustelle
- Versionsstand 0.20.0
