# Sicherheitsbetrieb

Stand: 22.08.2026 · technische Grundlage ab V0.45.0

Dieses Dokument beschreibt den tatsächlich implementierten Schutz. Es ist
kein Ersatz für Penetrationstest, Auftragsverarbeitungsvertrag oder rechtliche
Freigabe. Angreifer, Vertrauensgrenzen, Missbrauchsfälle und Restrisiken stehen
im [`THREAT_MODEL.md`](THREAT_MODEL.md).

## Durchgesetzte Grenzen

| Bereich | Serverseitige Durchsetzung |
|---|---|
| Mandant | `company_id` stammt aus der gehashten HttpOnly-Sitzung; RLS und Objektprüfungen begrenzen jede Fachabfrage. Client-Felder für Mandant oder Benutzer werden verworfen. |
| Rollen | Firmen- und Plattformrechte werden in der API erneut geprüft; die Oberfläche allein entscheidet nie. |
| Sitzungen | 256-Bit-Zufallstoken, nur SHA-256-Hash in PostgreSQL, `HttpOnly`, `SameSite=Strict`, in Produktion `Secure`; Logout, Kontosperre und Reset widerrufen serverseitig. |
| Anmeldung | Kontosperre plus HMAC-pseudonymisierte, PostgreSQL-gestützte Schranken je Anschluss und Kennung. Die Schranken überleben Neustarts und gelten über mehrere API-Instanzen. |
| Audit | Plattformaktionen tragen Benutzer, Sitzung, Zeitpunkt, Ziel, Begründung und Ergebnis. Token und Passworthashes werden aus Zuständen entfernt; das Audit ist unveränderlich. |
| Browser | Enge CSP, keine Fremdskripte, keine Plugins/Objekte, kein Fremd-Frame, COOP/CORP, HSTS, `nosniff` und eingeschränkte Kamera. |
| Transport | Eine echte Produktionsumgebung startet nur mit HTTPS-Herkunft, sicheren Cookies und PostgreSQL-TLS. `verify-full` ist die Vorlage. |

Der Client-IP-Wert aus `X-Forwarded-For` wird nur verwendet, wenn
`API_TRUSTED_PROXY_HOPS` der bekannten eigenen Proxy-Kette entspricht. Bei
`0` zählt ausschließlich die TCP-Gegenstelle. Nach einem Infrastrukturwechsel
wird die Kette mit einer synthetischen Anfrage geprüft; ein frei gesetzter
Header darf das Audit und die Schranke nicht verändern.

## Uploads

Die API akzeptiert nur PDF, JPEG, PNG, WebP, UTF-8-Text, XLSX und DOCX bis
5 MB. Die Prüfung gilt auch für Excel-Vorschauen, VDE-Originale,
Geräte-/Defektfotos und hochgeladene Unterschriftbilder. Vor dem Speichern
beziehungsweise Verarbeiten gelten vier voneinander unabhängige Prüfungen:

1. erlaubte Endung und erlaubter MIME-Typ,
2. kanonische Base64-Kodierung und Größenlimit,
3. tatsächliche Dateisignatur beziehungsweise sichere OOXML-Struktur,
4. ClamAV-Inhaltsprüfung über `INSTREAM`.

OOXML mit Makroprojekt, ActiveX oder eingebettetem Fremdobjekt wird unabhängig
vom Scanner abgewiesen. In `APP_ENVIRONMENT=production` ist der Scanner
verpflichtend und fail-closed: ist er nicht erreichbar, antwortet die API mit
503 und speichert nichts. Das kostenlose Render-System ist ausdrücklich
`demo`; dort ist der Scanner nicht als Produktionskontrolle ausgewiesen.

Der Scanner ersetzt weder Aktualisierung der Signaturen noch Sandboxing. Der
Betrieb überwacht Alter der Signaturdatenbank, Scanfehler und Antwortzeit.

## Passwortzurücksetzung

Es gibt keinen anonymen E-Mail-Reset. Die Plattformverwaltung führt einen
administrativ vermittelten Reset aus:

1. Support prüft die Identität über einen bereits vereinbarten zweiten Kanal.
2. Eine namentlich angemeldete Person mit `accounts.manage` erfasst eine
   nachvollziehbare Begründung.
3. Der Server erzeugt ein zufälliges Einmal-Startpasswort, speichert nur den
   scrypt-Hash, löscht Sperrzähler und widerruft alle Sitzungen.
4. Das Klartext-Startpasswort erscheint genau in dieser Antwort. Es wird weder
   im Audit noch erneut in einer Liste ausgegeben und über einen getrennten
   Kanal übergeben.
5. Nach der normalen Anmeldung muss die betroffene Person sofort ein eigenes
   Passwort setzen; dabei werden erneut alle anderen Sitzungen widerrufen.

Passwörter werden nie per E-Mail zusammen mit Benutzerkennung oder Firmen-ID
versandt. Ein zukünftiger Selbstbedienungs-Reset benötigt einmalige,
kurzlebige, gehashte Token, neutrale Antworten gegen Kontenermittlung und eine
eigene Versandschranke.

## Notzugang

- Keine gemeinsamen „Admin“-Konten. Jede Aktion muss einer Person zuordenbar
  sein.
- Ein Notzugang wird nur aus einem getrennten Passworttresor entnommen und
  durch zwei Personen freigegeben.
- Vor Nutzung werden Anlass, Ticket und erwartete Dauer festgehalten. Danach
  werden betroffene Sitzungen beendet, Geheimnisse rotiert und Audit/Support-
  Ereignisse gegengeprüft.
- Direkte Datenbankänderungen sind kein normaler Supportweg. Falls eine
  Wiederherstellung nötig ist, gilt das Vier-Augen-Verfahren aus
  `BACKUP_RESTORE_RUNBOOK.md`.

## Geheimnisse und Reaktion auf Vorfälle

Geheimnisse liegen je Umgebung getrennt im Secret-Store. Mindestrotation:
sofort nach Verdacht oder Personalwechsel, ansonsten nach Betreiberstandard.
Bei Rotation der API-Datenbankkennung wird zuerst eine zweite Kennung
bereitgestellt, die Anwendung umgeschaltet, die alte Sitzung beendet und erst
dann die alte Kennung entzogen. `SECURITY_RATE_LIMIT_SECRET` wird nur bei
Bedarf rotiert; die Rotation setzt laufende Schranken zurück und wird deshalb
protokolliert.

Bei einem Sicherheitsereignis: Schreibzugriffe begrenzen, Beweise und
unveränderliche Logs sichern, betroffene Sitzungen/Geheimnisse widerrufen,
Umfang je Firma feststellen, Datenschutz- und Meldepflicht durch die
verantwortliche Stelle bewerten, Wiederanlauf aus geprüftem Stand und danach
Ursachenbericht mit konkreten Folgemaßnahmen.

Technische Leitlinien: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) und
[OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html).
