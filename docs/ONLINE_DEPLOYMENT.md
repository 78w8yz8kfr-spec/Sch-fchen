# Schäfchen Online bereitstellen

Technischer Stand: V0.6-dev

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
