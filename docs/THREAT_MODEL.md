# Bedrohungsmodell

Stand: 22.08.2026 · technischer Stand V0.45.0

## Umfang und Schutzwerte

Betrachtet werden Browser/PWA, Firmen-API, Plattformverwaltung, PostgreSQL,
Datei- und Importschnittstellen, Malware-Scanner, Proxy sowie Sicherung und
Wiederherstellung. Zu schützen sind insbesondere Personen-, Zeit-, Kunden-,
Baustellen-, Dokument-, Prüf-, Vertrags- und Auditdaten, Zugangsdaten,
Sitzungstoken, Backup-Schlüssel und die eindeutige Trennung jeder Firma.

Der Browser ist keine Vertrauensgrenze. Firma, Benutzer, Rolle, Objektzugriff,
Dateityp und Status werden serverseitig neu bestimmt. Auch ein angemeldeter
Benutzer kann absichtlich manipulierte Anfragen senden. Eine kompromittierte
Datenbankeigentümer- oder Produktionsplattform kann dagegen alle Daten lesen
oder verändern; ihre Absicherung, Protokollierung und personelle Kontrolle ist
deshalb ein eigenständiges Betriebsgate.

## Akteure und Grenzen

- nicht angemeldete Angreifer mit frei wählbaren HTTP-Anfragen,
- angemeldete Firmenbenutzer, die Rechte oder Mandantengrenzen überschreiten
  wollen,
- kompromittierte Geräte, Sitzungen oder normale API-Zugangsdaten,
- bösartige Dateien und fehlerhafte/verwundbare Parser,
- Plattformpersonal mit weitreichenden, aber namentlich zuordenbaren Rechten,
- Bedienfehler, fehlerhafte Migrationen, Provider-Ausfall und Verlust von
  Primärdaten oder Schlüsseln.

Die wesentlichen Vertrauensübergänge sind Internet → eigener Proxy → API,
Firmen- beziehungsweise Plattformcookie → getrennte Sitzungsauflösung,
API-Rolle → PostgreSQL/RLS, Upload → Signaturprüfung → Scanner → Speicherung
und Primärdatenbank → verschlüsseltes externes Restic-Repository → getrennte
Restore-Umgebung.

## Bedrohungen, Kontrollen und Restrisiken

| Bedrohung | Durchgesetzte Kontrolle | Verbleibendes Gate / Restrisiko |
|---|---|---|
| Kennungsraten, Credential Stuffing und Kontenermittlung | neutrale Loginfehler, Dummy-Passwortprüfung, Kontosperre sowie persistente HMAC-Schranken je Anschluss und Kennung | verteilte Angriffe benötigen Provider-DDoS/WAF, Alarmierung und Lasttest |
| Gefälschtes `X-Forwarded-For` | Header zählt nur mit festgelegter Zahl eigener Proxys; alle Werte müssen gültige IP-Adressen sein | reale Proxykette nach jedem Infrastrukturwechsel prüfen |
| Sitzungsdiebstahl oder Weiternutzung nach Reset | 256-Bit-Zufall, nur Tokenhash in DB, `HttpOnly`, `SameSite=Strict`, in Produktion `Secure`; serverseitiger Widerruf bei Logout, Sperre, Passwortwechsel und Reset | kompromittierte Endgeräte und XSS bleiben Gegenstand von Gerätebetrieb und Penetrationstest |
| Firmenübergreifender Zugriff/IDOR | Firma und Benutzer ausschließlich aus Sitzung; Tenant-Fremdschlüssel, RLS, Objekt- und Rollenprüfung; Plattformkonten physisch getrennt | unabhängiger Mandanten-/Berechtigungs-Penetrationstest |
| Missbrauch der Plattformverwaltung | eigene Plattformrollen und Cookies, Pflichtbegründung, Sitzung/IP/Ziel im Audit, zeitlich begrenzter Supportzugriff | Rezertifizierung, Vier-Augen-Regeln und Notzugang organisatorisch abnehmen |
| Umbenannte, polyglotte, aktive oder schädliche Datei | Endungs-/MIME-Liste, kanonische Base64-Daten, Größenlimit, Signatur, begrenzte OOXML-Struktur ohne Makro/ActiveX/Einbettung, ClamAV-Stream; Produktion fail-closed | aktuelle Signaturen, Scannerüberwachung, Parser-Zero-Days und gegebenenfalls Content-Sandboxing |
| ZIP-Bombe oder Parserüberlastung | Begrenzung von Upload, ZIP-Einträgen und deklarierter Entpackgröße; nur unterstützte Kompressionsmethoden; Upload-/Schreibschranken | Lasttest und Prozess-/Container-Ressourcenlimits beim Zielprovider |
| Social Engineering beim Passwortreset | namentlich berechtigter Plattformbenutzer, Pflichtgrund, serverseitiges zufälliges Einmalpasswort, nur Hash gespeichert, einmalige Anzeige, Sitzungswiderruf und Pflichtwechsel | Identitätsprüfung und getrennter Übergabekanal müssen betrieblich freigegeben werden |
| SQL-Injektion oder kompromittierte API-Rolle | Parameterbindung, NOINHERIT-Login, getrennte eingeschränkte Gruppenrollen und RLS; Rate-Limit-Rohdaten sind nicht direkt lesbar | Datenbankeigentümer bleibt hochprivilegiert; Rotation und Monitoring extern nachweisen |
| Fehlerhafte oder halb angewandte Migration | nummerierte idempotente Migrationen, `ON_ERROR_STOP`, Upgrade-/Wiederholungstest und Vorwärtskorrektur statt nachträglichem Umschreiben | reales Staging, PITR vor Rollout und freigegebener Rollbackentscheid |
| Verlust, Verschlüsselung oder Manipulation der Primärdaten | Provider-PITR als Pflichtgate, verschlüsseltes getrenntes Restic-Backup, Retention, Vollcheck und geschützter Restore-Drill | Provider/PITR/Objektsperre, Schlüsselverwahrung, Alarm und monatlicher Messnachweis fehlen bis zur Betriebsabnahme |
| Backup-Exfiltration oder Schlüsselverlust | Restic verschlüsselt vor Ablage; Passwort als Secret-Datei und getrennte Offline-Kopie vorgesehen | tatsächliche Kontentrennung, unveränderliche Aufbewahrung und Schlüsselverantwortliche extern belegen |
| Vermischung von Demo, Staging und Produktion | `APP_ENVIRONMENT=production` erzwingt HTTPS, DB-TLS, eigenes HMAC-Geheimnis und Pflichtscanner; getrennte Vorlagen, Demo-Blueprint klar markiert | Zielplattform, Projekte, Datenbanken, Buckets und Geheimnisse real getrennt nachweisen |
| Verfügbarkeitsschaden durch legitime Großnutzung oder Angriff | gestufte Schranken, Größenlimits, begrenzter DB-Pool und Scanner-Zeitüberschreitung | Kapazitätsmodell, WAF/DDoS-Schutz, Monitoring, Bereitschaft und Lasttest |

## Negativ- und Wiederanlauftests

Die CI muss mindestens belegen:

- RLS- und Mandantentrennung mit beiden API-Rollen,
- atomare Rate-Limits ohne Klartextkennung und ohne direkten Tabellenzugriff,
- falsche Signatur, unsicheres OOXML, Scannerfund und Pflichtscanner-Ausfall,
- alter Login ungültig, Einmalpasswort gültig und anschließender Pflichtwechsel,
- Abbruch bei ungeeigneter Produktionskonfiguration,
- zweimalige Migration und Upgrade mit Vorgeschichte,
- verschlüsseltes Backup, vollständiger Restic-Check, Restore in eine getrennte
  Datenbank sowie Prüfung von Tabellen, Versionen, RLS und API-Rechten.

Die automatisierten Fälle liegen unter `api/tests/`, `database/tests/` und in
`.github/workflows/database.yml`. Sie ersetzen nicht den unabhängigen
Penetrationstest, realen Staging-Test, monatlichen Restore-Nachweis oder die
fachliche Sicherheitsfreigabe.

## Freigabeentscheidung

Dieses Modell wird bei neuer Datenart, neuem externen Dienst, geändertem
Uploadformat, Authentifizierungsweg oder Vertrauensproxy aktualisiert. Vor
echten Firmendaten tragen Produktverantwortung, Betrieb und Datenschutz den
tatsächlichen Nachweis mit Datum, Version, Befunden und akzeptierten
Restrisiken ein. Bis dahin bleiben die GitHub-Gates #15, #16, #17 und #19
offen.
