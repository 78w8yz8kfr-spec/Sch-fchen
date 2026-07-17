# API-Sicherheitsgrenze

Stand: 17.07.2026  
Technischer Stand: V0.6-dev

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

Die Anmeldung erwartet Firmennummer, Personalnummer und Passwort. Die Funktion
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
Tabellenrechte. Jede Fachtransaktion führt diese Reihenfolge aus:

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
GitHub Actions kommt ein echter PostgreSQL-Ablauf hinzu: ersten Admin anlegen,
PWA ausliefern, anmelden, Sitzung und Einsätze lesen, Arbeitsbeginn doppelt
übertragen, Feierabend buchen, Arbeitstag lesen, abmelden und den widerrufenen
Cookie zurückweisen.
