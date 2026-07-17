# API-Sicherheitsgrenze

Stand: 17.07.2026  
Technischer Stand: V0.5-dev

Die API ist die einzige erlaubte Verbindung zwischen PWA und PostgreSQL. Die
öffentliche GitHub-Pages-Demo bleibt lokal, bis eine geschützte API-Adresse mit
TLS und produktiver Secret-Verwaltung bereitsteht.

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
| `POST` | `/api/v1/session` | Mit Firma, Personalnummer und Passwort anmelden |
| `GET` | `/api/v1/session` | Eigene Firma, Person, Rollen und Ablaufzeit lesen |
| `DELETE` | `/api/v1/session` | Aktuelle Sitzung widerrufen |
| `GET` | `/api/v1/work-days/:date` | Eigenen berechneten Arbeitstag und Ereignisse lesen |
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

Der Seed enthält absichtlich keine erfundenen Mitarbeiter-Zugangsdaten. Ein
Passwort-Hash kann ohne Passwort im Prozessargument erzeugt werden:

```bash
read -s PASSWORD
printf '%s' "$PASSWORD" | node api/scripts/hash-password.mjs
unset PASSWORD
```

Der ausgegebene Hash wird serverseitig in `users.password_hash` gespeichert.
Der Hash und erst recht das Klartextpasswort gehören weder ins Repository noch
in Browserdaten. Ein späterer Admin-Endpunkt übernimmt diesen manuellen
Entwicklungsschritt.

## Prüfungen

`npm --prefix api test` prüft Hashing, Cookieattribute, Login-Sperre,
Eingabegrenzen, Mandantenfelder und Schrittfolge. In GitHub Actions kommt ein
echter PostgreSQL-Ablauf hinzu: Benutzer und Rolle anlegen, anmelden, Sitzung
lesen, Arbeitsbeginn doppelt übertragen, Feierabend buchen, Arbeitstag lesen,
abmelden und den widerrufenen Cookie zurückweisen.
