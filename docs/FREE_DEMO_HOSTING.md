# Kostenloser Testbetrieb: Render Free + Neon Free

Stand: 06.09.2026. **Vorbereitete Option, noch nicht beim Provider ausgerollt.**
Basis ist Sicherheits-PR #70 (`edddd76`); `main` war bei der Prüfung noch
`0e6055b` / 0.44.39. Der separate heutige Verbesserungsbranch
`claude/schaefchen-app-improvements-0as7bj` wird nicht verändert.

## Entscheidung

Für Entwicklung und Tests mit fiktiven Betriebsdaten bleibt die Node-/Docker-App
auf Render Free; PostgreSQL liegt auf Neon Free in AWS Frankfurt. PostgreSQL,
RLS, bestehende Migrationen und die getrennte API-Rolle bleiben erhalten.
Keine automatische kostenpflichtige Aufrüstung, keine Keep-alive-Pings.

Das optionale Blueprint `deploy/render-neon-demo.yaml` erstellt einen eigenen
Test-Webdienst und **keine** Render-Datenbank. `render.yaml` und vorhandene
Bestände bleiben unverändert. Automatische Deployments sind ausgeschaltet.
Das neue Profil ist auf den vorbereiteten Branch festgelegt; nach Integration
muss dieser Verweis bewusst auf den geprüften Zielbranch geändert werden.

## Altbestand zuerst klären

Render Free Postgres läuft nach 30 Tagen ab. Eine abgelaufene Datenbank ist
ohne Upgrade nicht zugänglich; nach weiteren 14 Tagen wird sie gelöscht.
Nicht zuerst löschen, resetten oder die Anwendung auf eine neue leere DB
zeigen lassen. Auch Browsercache/Offline-Warteschlangen nicht ungeprüft löschen.

1. Im Render-Konto den tatsächlich betroffenen Dienst, Status, Ablaufdatum und
   gegebenenfalls die letzte Wiederfreigabefrist feststellen.
2. Vorhandene **Daten**sicherung suchen; GitHub enthält Quellcode und ist kein
   Backup der betriebsindividuellen Datenbank.
3. Ist ein Export noch möglich, zunächst verschlüsselt sichern. Ist die DB
   bereits gesperrt, keinen kostenlosen Zugriff versprechen: eigenes Backup,
   eine vom Provider angebotene Freigabe oder ein ausdrücklich vom Nutzer
   gewähltes kostenpflichtiges Upgrade sind die möglichen Wege.
4. Wiederherstellung nur in einem neuen getrennten Ziel und unter Erhalt der
   Originalkopie; Größe, Datenbestand, Rollen, RLS und App-Fassung prüfen.
   Einen echten Bestand nicht in die hier beschriebene Demo importieren.
5. Erst nach Abnahme Verbindung/Adresse umstellen. Rückweg und Offline-Daten
   berücksichtigen. Die Altressource erst nach gesonderter Entscheidung entfernen.

## Kosten und Grenzen

| Teil | Aktuell veröffentlichte Grenze |
|---|---|
| Render Free | 750 Instanzstunden/Workspace/Monat; Schlafen nach 15 Minuten; Wiederanlauf ungefähr eine Minute |
| Neon Free | Kein zeitlich begrenzter Trial; 0,5 GB PostgreSQL-Speicher/Projekt; 100 CU-Stunden/Monat/Projekt |
| Neon Region | AWS Frankfurt (`aws-eu-central-1`), bei Neuanlage auswählen |
| Dateien | In Schäfchen aktuell PostgreSQL-BYTEA; dieselben 0,5 GB werden verbraucht |
| Sicherung | Neon Free: begrenztes Restore-Fenster bis sechs Stunden bzw. 1 GB Änderungen; kein Nachweis des projektspezifisch geforderten Backupbetriebs |

Kontingente, Build-/Bandbreitenkosten und hinterlegte Zahlungsmittel im
jeweiligen Konto prüfen. Ohne passend geprüfte Kostenbegrenzung keine absolute
0-Euro-Rechnung versprechen. Render kann ungewöhnlich hohen externen Verkehr
(auch zu einer externen Datenbank) zum Anlass einer Free-Sperrung nehmen.
Mehrere Webdienste teilen sich Stunden und weitere Workspace-Kontingente.

Für den späteren Bedarf oberhalb 10 GB reicht dieses Datenbankkontingent nicht.
Neons zusätzlicher Beta-Objektspeicher ist **nicht** automatisch an Schäfchen
angebunden. Für Produktion gelten weiterhin
`ENVIRONMENTS_AND_RELEASE_GATES.md`, `BACKUP_RESTORE_RUNBOOK.md` und die
offenen Gates #15/#16/#17/#19. Kostenloses Hosting allein erfüllt diese nicht.

## Einrichtung eines neuen fiktiven Testbestands

1. Neon-Free-Projekt mit **PostgreSQL 17**, Region **AWS Frankfurt** erstellen.
   Keine bestehende Produktivdatenbank auswählen. Keine kostenpflichtigen
   Zusatzdienste buchen.
2. Den **direkten** Endpoint verwenden, nicht den `-pooler`-Host. Der bestehende
   Migrationsstart verwendet eine sitzungsbezogene Advisory-Lock; ein
   Transaktionspooler ist dafür ungeeignet.
3. Die Owner-Verbindungsadresse ausschließlich als Render-Secret `DATABASE_URL`
   hinterlegen. Queryparameter: `sslmode=verify-full&sslrootcert=system`.
   Beispielstruktur ohne echte Zugangsdaten:

   ```text
   postgresql://OWNER:PASSWORD@DIRECT_NEON_HOST/DATABASE?sslmode=verify-full&sslrootcert=system
   ```

   `sslrootcert=system` erfordert libpq 17 oder neuer und einen vorhandenen
   CA-Systemspeicher. Im gebauten Image prüfen. Niemals zur Fehlerumgehung
   Zertifikatsprüfung abschalten.
4. `API_DB_USER=schaefchen_api_login` und ein getrenntes zufälliges
   `API_DB_PASSWORD` verwenden. Der Login wird durch
   `database/scripts/configure-api-role.sql` angelegt. **Nicht** zusätzlich
   über die Neon-Konsole anlegen: solche Rollen erhalten `neon_superuser`.
   Bereits vorhandene API-Rollen auf tatsächliche Mitgliedschaften,
   Eigentümerrechte und RLS-Umgehung prüfen.
5. Das alternative Blueprint nutzen oder seine Werte gezielt in einen
   neuen Test-Webdienst übernehmen. `API_DB_SSL_MODE=verify-full`,
   `API_DB_POOL_SIZE=3`, `APP_ENVIRONMENT=demo`. Der Start prüft dies vor
   jeglicher DB-Verbindung. Keine echte Produktionsumgebung zu `demo`
   umetikettieren.
6. `INITIAL_SETUP_TOKEN` und `PLATFORM_SETUP_TOKEN` als getrennte zufällige
   Secrets mit mindestens 24 Zeichen setzen; nach der Ersteinrichtung
   entfernen. Die Seed-Daten des bestehenden Projekts und Firmenbezeichnungen
   prüfen; keine echten Beschäftigtenkonten oder Betriebsdaten als Testfixture
   verwenden.
7. Die vollständige GitHub-Prüfung abwarten; erst danach bewusst deployen.
   Einmaliger Migrationsstart gegen Neon und Wiederholungsstart müssen
   erfolgreich sein. Danach API-Anmeldung, Speichern/Lesen, Persistenz nach
   Neustart und Ablehnung mandantenfremder Zugriffe prüfen.

Das allgemeine Startskript wendet bestehende Migrationen an. Deshalb niemals
eine ungesicherte, wertvolle Bestandsdatenbank für einen ersten Kompatibilitätstest
verwenden. Keine bestehende SQL-Migration wurde für diese Option umgeschrieben.

## Vertragliche Freigabe

Der neue Dokumentensatz enthält Testvertrag, späteren B2B-SaaS-Vertrag mit
Leistung/Support/Exit, AVV/TOM, Mitarbeiter-Nutzungsvereinbarung und eine
Betriebs-/Veröffentlichungshilfe. Der bisherige Vertragsentwurf V0.1 bleibt
Referenz. Vor Unterzeichnung müssen tatsächliche Betreiber-, Kunden-,
Provider-, Frist-, Leistungs- und Preisdaten ergänzt werden.

Besonders keine noch unbelegten Eigenschaften zusagen:

- Ein `two_factor_enabled`-Feld ist keine wirksame App-MFA; der geprüfte
  Plattform-Login eröffnet eine Sitzung nach Passwortprüfung.
- `advancePrivacyRequest` dokumentiert den Ablauf; ein Status `completed`
  ersetzt keinen Nachweis physischer Löschung in allen Datenbeständen.
- Vorhandene einzelne Fach-/Dateiexporte sind noch kein geprüfter vollständiger
  Mandantenexport mit Feld-/Formatregister nach der vereinbarten Exit-Anlage.
- Backup-/Scanner-Skripte und Tests belegen keinen tatsächlich laufenden
  Providerdienst, keine MFA des Hostingkontos und keine gemessene RPO/RTO.
- Eine EU-Rechenzentrumsregion ersetzt weder Provider-AVV noch Transferprüfung
  für mögliche Drittlandzugriffe.

## Prüfung dieser Änderung

Lokal: `node --test deploy/free-demo.test.mjs` (10 Fälle), Shell-Syntax und
`git diff --check`. Keine Verbindung zu Neon/Render und keine Datenmigration
wurden ausgeführt. Docker ist lokal nicht installiert; daher sind die
vorgeschriebenen Compose-/SQL-Prüfungen erst mit erfolgreicher GitHub-CI belegt.
Die lokale Konfigurationsprüfung ist ausdrücklich kein Provider-Abnahmetest.

## Quellen

- [Render Free](https://render.com/docs/free)
- [Neon Pricing](https://neon.com/pricing)
- [Neon Regions](https://neon.com/docs/introduction/regions)
- [Neon Roles](https://neon.com/docs/manage/roles)
- [DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de)
- [Data Act](https://eur-lex.europa.eu/eli/reg/2023/2854/oj?locale=de)

Für rein lokale Entwicklung steht weiterhin die Docker-Entwicklungsumgebung
zur Verfügung. Sie verursacht keine Cloud-Grundgebühr, setzt aber eigene
Hardware, Strom, Wartung und Sicherung voraus und ist kein Ersatz für einen
ständig erreichbaren gemeinsamen Onlinedienst.
