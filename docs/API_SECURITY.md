# API-Sicherheitsgrenze

Stand: 18.07.2026  
Technischer Stand: V0.11.0

Die API ist die einzige erlaubte Verbindung zwischen PWA und PostgreSQL. Die
öffentliche GitHub-Pages-Adresse bleibt eine lokale Demo. Im Online-Betrieb
liefert derselbe HTTPS-Webdienst PWA und API aus, damit das strikte
Sitzungscookie nie einen fremden Ursprung benötigt.

## Einmalige Ersteinrichtung

`api_get_initial_setup_status` gibt für die fest konfigurierte Startfirma nur
Name, Nummer und den Einrichtungsstatus zurück. Solange noch kein Benutzer
existiert, kann `api_create_initial_admin` genau ein Konto mit der aktiven
Admin-Systemrolle anlegen. Der API-Endpunkt verlangt zusätzlich einen
mindestens 24 Zeichen langen geheimen Einrichtungsschlüssel, vergleicht ihn
zeitkonstant und begrenzt Fehlversuche. Das Passwort wird vor der
Datenbanktransaktion mit `scrypt` gehasht.

## Anmeldung und Sitzung

Die interne API-Anmeldung erwartet Firmennummer, Personalnummer und Passwort.
Die PWA übernimmt die bei der Ersteinrichtung serverseitig festgelegte
Firmennummer im Hintergrund; normale Benutzer sehen nur Personalnummer und
Passwort. Die Funktion
`api_lookup_login_user` führt die eng begrenzte Suche vor dem Mandantenkontext
aus. Sie ist nur für die NOLOGIN-Rolle `schaefchen_api` ausführbar.

Passwörter haben das Format
`scrypt$N$r$p$salt-base64url$hash-base64url`. Zulässige Parameter sind begrenzt,
damit manipulierte Hashes keine unkontrollierte Rechen- oder Speicherlast
auslösen. Fehlende Benutzer werden mit demselben Hashverfahren geprüft und
erhalten dieselbe Fehlermeldung wie falsche Passwörter. Nach fünf Fehlern wird
die Kombination aus Netzwerkadresse, Firma und Personalnummer vorübergehend
gesperrt.

Ein erfolgreicher Login erzeugt 32 kryptografisch zufällige Bytes. In
`user_sessions` wird nur deren SHA-256-Hash gespeichert. Der Browser erhält das
Original als `HttpOnly`, `SameSite=Strict` und in Produktion `Secure` gesetztes
Cookie. Abmeldung widerruft die Sitzung; ein Hartlöschen ist nicht erlaubt.

## Mandantenschutz

Der technische Datenbankbenutzer `schaefchen_api_login` besitzt keine direkten
Tabellenrechte und ist kein Tabelleneigentümer. Row Level Security gilt für ihn
daher bei jeder Abfrage. Nur der getrennte Datenbankeigentümer darf RLS für
Migrationen, Seeds und die eng begrenzten `SECURITY DEFINER`-Funktionen umgehen.
Er wird nicht für API-Verbindungen verwendet. Jede Fachtransaktion führt diese
Reihenfolge aus:

1. Transaktion beginnen und lokal in `schaefchen_api` wechseln.
2. Sitzung über ihren Token-Hash auflösen.
3. Firma und Benutzer aus der Sitzung in `app.current_company_id` und
   `app.current_user_id` setzen.
4. Fachabfrage unter erzwungener Row Level Security ausführen.

Felder wie `companyId` und `userId` werden in Client-Nutzdaten abgewiesen. Die
API setzt beide Werte ausschließlich selbst.

## Endpunkte

| Methode | Pfad | Aufgabe |
| --- | --- | --- |
| `GET` | `/health` | Datenbank-Erreichbarkeit ohne Fachdaten prüfen |
| `GET` | `/api/v1/setup` | Status der einmaligen Ersteinrichtung lesen |
| `POST` | `/api/v1/setup` | Genau den ersten Admin geschützt anlegen |
| `POST` | `/api/v1/account/initial-password` | Persönliches Startpasswort einmalig ersetzen |
| `GET` | `/api/v1/admin/overview?date=JJJJ-MM-TT` | Mitarbeiter, Baustellen und Wochenplanung Montag bis Freitag |
| `POST` | `/api/v1/admin/employees` | Mitarbeiter mit Startpasswort und begrenzter Rolle anlegen |
| `POST` | `/api/v1/admin/sites` | Kunde, Standort, Projekt und Baustelle gemeinsam anlegen |
| `POST` | `/api/v1/admin/assignments` | Geordneten Tageseinsatz freigeben |
| `PATCH` | `/api/v1/admin/assignments/:id` | Einsatz mit Begründung verschieben oder Startzeit ändern |
| `POST` | `/api/v1/admin/assignments/:id/cancel` | Einsatz mit Begründung stornieren; Historie bleibt erhalten |
| `POST` | `/api/v1/admin/assignment-imports/preview` | XLSX-Wochenplan prüfen und sichere X-Zuweisungen vorschlagen |
| `POST` | `/api/v1/admin/assignment-imports` | zuvor prüfbare X-Zuweisungen geschützt importieren |
| `POST` | `/api/v1/admin/site-imports/preview` | XLSX-Baustellenliste prüfen und neue Pakete vorschlagen |
| `POST` | `/api/v1/admin/site-imports` | geprüfte Kunden-, Projekt- und Baustellenpakete anlegen |
| `POST` | `/api/v1/session` | Mit Firma, Personalnummer und Passwort anmelden |
| `GET` | `/api/v1/session` | Eigene Firma, Person, Rollen und Ablaufzeit lesen |
| `DELETE` | `/api/v1/session` | Aktuelle Sitzung widerrufen |
| `GET` | `/api/v1/work-days/:date` | Eigenen berechneten Arbeitstag und Ereignisse lesen |
| `GET` | `/api/v1/site-assignments/:date` | Eigene freigegebene Tageseinsätze lesen |
| `POST` | `/api/v1/time-entries` | Offline-Zeitereignis idempotent synchronisieren |

Der Zeitendpunkt verlangt eine Client-UUID, Buchungsart und ISO-Zeitpunkte mit
Zeitzone. Baustellenereignisse benötigen eine für diesen Mitarbeiter und Tag
freigegebene Baustelle. Der Server sperrt den jeweiligen Mitarbeiter-Tag
transaktional, prüft Zeitreihenfolge und nächsten logischen Schritt und legt den
Arbeitstag bei Bedarf an. Eine bereits identisch gespeicherte Client-UUID ist
erfolgreich idempotent; abweichende Daten führen zu `409 Conflict`.

Die Verwaltungsendpunkte prüfen zusätzlich die aktiven Rollen aus der
serverseitig aufgelösten Sitzung. Administrator, Geschäftsführer,
Büro/Disposition und Projektleiter dürfen entsprechend ihrer fachlichen Rolle
planen und verwalten. Verwaltungsrollen dürfen nur Administrator und
Geschäftsführer vergeben. Bestehende Konten mit `office`, `planner` oder
`executive_assistant` bleiben kompatibel, diese Rollen werden aber nicht mehr
neu angeboten. Monteur und Vorarbeiter erhalten keine Verwaltungsrechte. Bis zum
persönlichen Wechsel des Startpassworts sind Fach- und Verwaltungsendpunkte für
das neue Konto gesperrt.

Der Excel-Import akzeptiert ausschließlich `.xlsx` bis 1,5 MB. Zusätzlich
werden Archivstruktur, entpackte Gesamtgröße, Tabellenabmessungen und maximale
Zuweisungszahl begrenzt. Mitarbeiter und Baustellen werden nur bei genau einem
normalisierten Treffer übernommen. Ein unbekannter oder mehrdeutiger Wert
sperrt den vollständigen Mitarbeitertag. Bereits geplante Tage werden weder in
der Vorschau noch beim transaktionalen Import überschrieben. Abwesenheits- und
Sonderkürzel werden lediglich gezählt; V0.11.0 legt daraus keine Fachdaten an.
Unbekannte Mitarbeiter- oder Baustellenbezeichnungen können ausdrücklich auf
eine aktive ID des Sitzungsmandanten abgebildet werden. Der Server validiert
jede Zuordnung erneut und akzeptiert keine fremden oder frei erfundenen IDs.

Der Baustellenlistenimport verlangt die Spalten Kunde, Baustelle, Straße,
Hausnummer, PLZ und Ort; Projekt und Aufgabe sind optional. Fehlerhafte Zeilen
werden einzeln gemeldet. Vorhandene aktive Baustellennamen werden nicht erneut
angelegt. Eindeutig vorhandene Firmenkunden werden wiederverwendet, neue Kunden
werden gemeinsam mit Standort, Projekt und Baustelle in derselben Transaktion
angelegt. Eine mandantenbezogene Sperre verhindert konkurrierende Doppelimporte.

## Lokale Inbetriebnahme

Nach dem Ersetzen aller `CHANGE_ME`-Werte startet folgendes Kommando Datenbank,
Migrationen, eingeschränkte Login-Rolle, Tests und API:

```bash
make dev-init
```

Der Seed enthält absichtlich keine erfundenen Mitarbeiter-Zugangsdaten. Lokal
kann der erste Admin über denselben Einrichtungsendpunkt angelegt werden. Für
gezielte Entwicklungstests lässt sich ein Passwort-Hash weiterhin ohne
Passwort im Prozessargument erzeugen:

```bash
read -s PASSWORD
printf '%s' "$PASSWORD" | node api/scripts/hash-password.mjs
unset PASSWORD
```

Der ausgegebene Hash wird serverseitig in `users.password_hash` gespeichert.
Der Hash und erst recht das Klartextpasswort gehören weder ins Repository noch
in Browserdaten.

## Prüfungen

`npm --prefix api test` prüft Hashing, Cookieattribute, Login-Sperre,
Einrichtungsschlüssel, Eingabegrenzen, Mandantenfelder und Schrittfolge. In
GitHub Actions werden Migration und Seed zusätzlich mit einem nicht
privilegierten, Render-ähnlichen Datenbankeigentümer geprüft. Danach folgt der
echte PostgreSQL-Ablauf: ersten Admin anlegen, PWA ausliefern, anmelden,
Büro/Disposition und Monteur anlegen, Excel-Import vorschauen und doppelt geschützt
ausführen, Einsatz freigeben, Startpasswort persönlich ändern,
Rollenverbot prüfen, Einsatz historisiert verschieben und stornieren, Zeiten
idempotent übertragen, Arbeitstag lesen, abmelden und den widerrufenen Cookie
zurückweisen.
