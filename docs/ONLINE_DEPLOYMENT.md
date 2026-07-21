# Schäfchen Online bereitstellen

Technischer Stand: V0.19.0

Das Firmenlogo von Schaaf Elektro stammt unverändert aus dem bestehenden
VDE-Prüfprotokoll. Es wird im Login und App-Kopfbereich getrennt vom
Schäfchen-Markenlogo angezeigt und für die Offline-Nutzung mitgespeichert.

Nach der Anmeldung können Administrator, Geschäftsführer, Büro/Disposition und
Projektleiter im Hauptbereich **Einsätze** direkt unter **Einsatz freigeben**
eine `.xlsx`-Datei auswählen. Erst die Vorschau zeigt, welche X-Zuweisungen
eindeutig importiert werden können; eine zweite Bestätigung speichert sie.
Bestehende Mitarbeitertage und nicht eindeutig zugeordnete Namen bleiben
unverändert.

Unbekannte Mitarbeiter- oder Baustellennamen werden in der Vorschau mit einem
Auswahlfeld angezeigt und können dort einem vorhandenen Eintrag zugeordnet
werden. Im Hauptbereich **Baustellen** sitzt der Excel-Import dauerhaft direkt
unter der Schaltfläche **Baustelle anlegen**. Dort steht auch eine fertige
Excel-Vorlage bereit. Nach dem Ausfüllen werden neue Baustellen ebenfalls erst
geprüft und dann bestätigt; vorhandene Namen werden nicht doppelt angelegt.

Die Baustellenliste kann nach Name, Kunde, Projekt und Ort durchsucht sowie nach
Status gefiltert werden. Über **Öffnen → Bearbeiten** lassen sich Auftrag,
Adresse und Status pflegen. Abschluss oder Archivierung sind nur möglich, wenn
keine aktuellen oder zukünftigen Einsätze mehr an der Baustelle hängen.

Kunden und Projekte besitzen im Bereich **Baustellen** jeweils eine dauerhaft
sichtbare, durchsuchbare Verwaltung. Die Anlegeformulare bleiben kompakt
aufklappbar. Über **Bearbeiten** lassen sich Stammdaten und Status pflegen;
aktive Projekte beziehungsweise Baustellen verhindern ein versehentliches
Archivieren des übergeordneten Datensatzes.

Im Bereich **Baustellen** steht außerdem die zentrale Dokumentenverwaltung.
Eine Datei wird einem Kunden, Projekt oder einer Baustelle zugeordnet. Bei
einer Baustelle ergänzt Schäfchen Projekt und Kunde automatisch. Dieselbe Datei
erscheint anschließend in allen passenden Ebenen und wird nicht kopiert.
Unterstützt werden PDF, Bilder, Text, XLSX und DOCX bis 5 MB. Vor größeren
produktiven Dateimengen muss der vorbereitete Objektspeicher aktiviert werden.

Die Produktionsvorlage in `render.yaml` startet die PWA, die API und PostgreSQL
unter einer gemeinsamen HTTPS-Adresse. Dadurch funktionieren das sichere
HttpOnly-Sitzungscookie und die Offline-Synchronisation auch auf dem Handy.

## Einmalige Bereitstellung über Render

1. Bei [Render](https://dashboard.render.com/) anmelden und GitHub verbinden.
2. **New +** und danach **Blueprint** wählen.
3. Das Repository `78w8yz8kfr-spec/Sch-fchen` auswählen.
4. Beim Feld `INITIAL_SETUP_TOKEN` einen zufälligen Schlüssel mit mindestens
   24 Zeichen aus einem Passwortmanager eintragen und sicher aufbewahren.
5. Den Blueprint erstellen und warten, bis `schaefchen-online` den Status
   **Live** zeigt.
6. Die angezeigte `onrender.com`-Adresse öffnen. Beim ersten Aufruf erscheint
   automatisch **Ersten Admin anlegen**.
7. Namen, Personalnummer, ein Passwort mit mindestens zwölf Zeichen sowie den
   gleichen Einrichtungsschlüssel eingeben. Danach normal anmelden.

Nach dieser Einrichtung sehen normale Benutzer beim Login nur noch
Personalnummer und Passwort. Die Firmennummer wird von der bereitgestellten
Firmeninstanz im Hintergrund gesetzt.

Der Einrichtungsschlüssel liegt nur als geheime Umgebungsvariable bei Render
und wird nicht in GitHub gespeichert. Ein zweiter Initial-Admin kann über
diesen Weg nicht angelegt werden.

## Betriebshinweise

Die Vorlage nutzt zum gefahrlosen Ausprobieren zunächst die kostenlosen
Render-Tarife. Kostenlose PostgreSQL-Datenbanken laufen nach 30 Tagen ab und
sind nicht für echte Betriebsdaten gedacht. Vor produktiver Nutzung müssen
deshalb Datenbank und Webdienst auf bezahlte Tarife umgestellt sowie Backups
und ein Lösch-/Aufbewahrungskonzept eingerichtet werden.

Render stellt für Webdienste verwaltetes TLS bereit. Beim Start werden alle
Migrationen idempotent ausgeführt, die eingeschränkte API-Datenbankrolle
konfiguriert und erst danach der Server gestartet.

Offizielle Referenzen:

- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [Render Web Services und TLS](https://render.com/docs/web-services)
- [Render PostgreSQL](https://render.com/docs/postgresql-creating-connecting)
- [Einschränkungen kostenloser Dienste](https://render.com/docs/free)
