# Umgebungen und Freigabegates

Stand: 22.08.2026

## Strikte Trennung

| Umgebung | Daten | Infrastruktur | Freigabe |
|---|---|---|---|
| Entwicklung | synthetisch | lokales Compose, eigene Schlüssel | keine externe Erreichbarkeit |
| Demo | ausschließlich Demo-Daten | aktuelles kostenloses `render.yaml` | niemals als Produktivsystem bezeichnen |
| Staging | synthetisch oder ausdrücklich freigegeben | eigenes Projekt, DB, Scanner, Bucket, Domains und Geheimnisse | Migration, Smoke-, Last- und Restore-Test |
| Produktion | echte Firmendaten | geschütztes eigenes Projekt, bezahlte DB mit PITR, externer verschlüsselter Backup-Speicher | technische, betriebliche und rechtliche Abnahme |

Kein Schlüssel, Datenbanksnapshot, Bucket, OAuth-Client oder Servicekonto wird
zwischen Staging und Produktion geteilt. Render-Projekte/Environments werden
entsprechend getrennt und Produktion geschützt. Die Vorlagen unter
`deploy/environments/` sind nur Schemas; Werte kommen aus dem jeweiligen
Secret-Store.

`APP_ENVIRONMENT=production` aktiviert harte Startbedingungen: HTTPS-Herkunft,
PostgreSQL-TLS, mindestens 32 Zeichen für den Rate-Limit-HMAC und ein
erreichbar konfigurierter Pflichtscanner. Damit kann eine Demo-Konfiguration
nicht durch bloßes Umbenennen unbemerkt zur Produktionskonfiguration werden.

## Weg von Staging nach Produktion

1. Dasselbe unveränderliche Image per Digest in Staging ausrollen.
2. Migrationen mit `ON_ERROR_STOP` anwenden; zweimalige/idempotente Prüfung,
   API-, Mandanten-, Upload- und Restore-Tests müssen grün sein.
3. Vor der Produktionsmigration aktuelles PITR und verschlüsseltes Snapshot
   nachweisen.
4. Image-Digest und nummerierte Migrationen freigeben; Produktion übernimmt
   keine Staging-Geheimnisse.
5. Health, Fehlerrate, 429/5xx, Scanfehler, DB-Verbindungen und fachlichen
   Smoke-Test beobachten. Bei Abweichung Rollout stoppen.

Eine fehlgeschlagene Migration beendet den Start. Bereits veröffentlichte
Migrationen werden nicht zurückeditiert. Die normale Korrektur ist eine neue,
vorwärts gerichtete Migration; ein Rückrollen des Containers ist nur erlaubt,
wenn dessen Schema-Kompatibilität belegt ist. Datenrestore ist die letzte
Option und folgt dem Vier-Augen-Ablauf.

## Staging-Sicherheitsabnahme

Vor jeder Produktionsfreigabe wird mit synthetischen Konten protokolliert:

1. Altes Sitzungs-Cookie nach Logout, Kontosperre, Passwortreset und
   Passwortwechsel jeweils mit 401 abgewiesen; Einmalpasswort nur einmal
   angezeigt und Pflichtwechsel wirksam.
2. Falsche Dateisignatur und Scannerfund abgewiesen; bei gestopptem Scanner
   liefert jeder Upload 503 und es entsteht kein Dokumentdatensatz.
3. Login-, Setup-, Upload- und Schreibgrenzen liefern 429 samt `Retry-After`;
   Neustart und zweite API-Instanz setzen die Zähler nicht zurück.
4. Proxytest mit frei gesetztem `X-Forwarded-For` belegt die konfigurierte
   Vertrauenskette und die erwartete Audit-IP.
5. Zweite Datenbankkennung bereitgestellt, Anwendung umgeschaltet und alte
   Kennung erst danach entzogen. Rotation des HMAC-Geheimnisses wird als
   bewusster Reset laufender Schranken vermerkt; keine Produktionsgeheimnisse
   werden dafür nach Staging kopiert.
6. Fehlmigration stoppt den Start; korrigierende Vorwärtsmigration,
   Wiederanlauf und Restore-Entscheid werden mit Image-Digest dokumentiert.

Das Protokoll enthält Datum, Umgebung, Image-Digest, ausführende und
gegenprüfende Person sowie Links auf Logs ohne Token oder Passwörter. Eine nur
lokal oder in CI bestandene Prüfung erfüllt dieses Staging-Gate nicht.

## Noch externe Freigaben

- endgültige Plattform-, Region-, Kosten- und Betreiberentscheidung,
- bezahltes PITR, getrennte Backup-Zugangsdaten und gemessener Monatsdrill,
- Monitoring/Alarmierung und Bereitschaft mit benannten Verantwortlichen,
- unabhängiger Penetrationstest und Behebung kritischer Befunde,
- AVV, TOM, Datenschutzhinweise, Verzeichnis der Verarbeitungstätigkeiten,
  Lösch-/Aufbewahrungskonzept, Impressum und Vertragsunterlagen,
- Freigabe von Unterauftragsverarbeitern und Drittlandtransfers.

Das aktuelle `render.yaml` ist deshalb weiterhin eine Demo-Blueprint und kein
stillschweigender Hostingentscheid. Render beschreibt geschützte, getrennte
Umgebungen unter [Projects and Environments](https://render.com/docs/projects).
