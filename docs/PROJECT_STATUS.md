# Projektstatus

Stand: 28.07.2026
Technischer Stand: V0.32.0

## Abgeschlossen

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
- persönlicher Excel-Export für Mitarbeiter enthält ausschließlich eigene freigegebene oder abgerechnete Tage
- navigierbare Wochenhistorie mit eindeutigem Freigabestatus sowie sichtbarer Soll- und Mehrzeit
- Bautagesbericht und Montageschein mit Teamstunden, lokaler Entwurfssicherung, Vollständigkeitsprüfung und strukturierten Zusatzangaben in der finalen PDF
- durchsuchbare Baustellenablage Kunde → Projekt → Baustelle; doppelte Verwaltungslisten entfallen, Formulare erscheinen nur noch bei einer gezielten Aktion

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
- direkte Kameraaktion für Lieferscheine im Dokumentbereich der geöffneten Baustelle
- einmalige zentrale Speicherung des Lieferschein-Fotos mit automatischer Verknüpfung zu Baustelle, Projekt und Kunde
- serverseitige Beschränkung von Lieferscheinen auf JPG, PNG oder WebP bis 5 MB
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
- Migration 029 schafft mandantengetrennte Freigaben für optionale Elektro-Module
- nur Administration und Geschäftsführung dürfen Spezialmodule aktivieren; jede Änderung besitzt Versionsschutz und unveränderliche Historie
- deaktivierte oder noch nicht vollständig angebundene Module erzeugen keine leeren Menüpunkte
- Migration 030 begrenzt die Modulplanung verbindlich auf VDE und DGUV; LWL und KNX gehören nicht zum Projektumfang
- Migration 031 erlaubt nachvollziehbare Zeitkorrekturen an abgerechneten Tagen ohne die Abrechnungssperre für neue Buchungen aufzuweichen
- Migration 032 vervollständigt die Zeiterfassung um Feldbaustellen, spontane Einsatzwahl, Ergänzungen, Ungültigmarkierungen, automatische Büroprüfung und Rechenregel Version 3

## Noch zu prüfen

- vollständiger lokaler Docker-Start auf einem eigenen Rechner mit Docker
- Backup-/Restore-Abnahme mit einem dauerhaft gespeicherten lokalen Entwicklungsvolumen; der isolierte CI-Durchlauf ist automatisiert
- genaue Firmenkontakt- und Lizenzdaten der Schaaf Elektro GmbH; im Seed wurden bewusst keine Daten erfunden
- Render-Blueprint einmalig mit dem GitHub-Konto bereitstellen und Online-Adresse abnehmen
- vor echten Betriebsdaten dauerhafte Tarife, Backups und Aufbewahrungskonzept festlegen

## Nächster Entwicklungsschritt

Nach Abschluss der Zeiterfassung wird die vorhandene VDE-Anwendung als erstes aktivierbares Elektro-Spezialmodul
kontrolliert an den gemeinsamen Kunden-, Projekt-, Baustellen-, Mitarbeiter-
und Dokumentenbestand angebunden.

Betriebssicherheit mit dauerhafter Datenbank, Backup-Plan,
Wiederherstellungsprobe, Überwachung und Objektspeicher wurde auf ausdrücklichen
Wunsch für diesen Schritt übersprungen und bleibt vor echten Betriebsdaten
verbindlich nachzuholen. Mobile Aufgabenaktionen bleiben gemäß der aktuellen
Priorisierung ebenfalls zunächst übersprungen.

Die öffentliche GitHub-Pages-PWA bleibt eindeutig als lokale Demo
gekennzeichnet; die echte Anmeldung läuft ausschließlich auf der gemeinsamen
Online-Adresse.
