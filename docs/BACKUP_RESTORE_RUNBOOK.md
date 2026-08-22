# Backup- und Wiederherstellungsablauf

Stand: 22.08.2026 · Zielwerte RPO ≤ 15 Minuten, RTO ≤ 4 Stunden

Ein erfolgreiches `pg_dump` ist noch kein Produktionsnachweis. Das Gate ist
erst erfüllt, wenn Provider-PITR aktiv ist, ein verschlüsseltes Zweitbackup an
einem getrennten Ort liegt und eine Wiederherstellung in eine getrennte
Umgebung innerhalb der Zielzeit gemessen wurde.

## Schutzmodell

| Ebene | Zweck | Mindesttakt / Aufbewahrung |
|---|---|---|
| Provider-PITR | Verlust zwischen logischen Sicherungen | fortlaufend, Wiederherstellungsfenster nach Vertrag; für Produktion zwingend |
| Restic-Zweitbackup | Provider- oder Bedienfehler, unabhängige Kopie | täglich; 14 täglich, 8 wöchentlich, 12 monatlich, 3 jährlich |
| Restore-Drill | Beweis, dass Schlüssel, Dump und Verfahren funktionieren | monatlich und vor risikoreichen Datenmigrationen |

Das Restic-Repository liegt in einem anderen Projekt/Konto als die
Produktionsdatenbank, mit Versionierung beziehungsweise Object Lock. Der
Backup-Principal darf neue Objekte schreiben, aber keine Aufbewahrung
verkürzen. Das Repository-Passwort liegt als Secret-Datei in einem Tresor; eine
zweite, offline verwahrte Kopie ist nötig, weil ohne Schlüssel auch ein
intaktes Repository unbrauchbar ist.

Dokumentinhalte befinden sich derzeit noch in `document_contents` und sind
damit im konsistenten PostgreSQL-Dump enthalten. Vor der Umstellung auf
Objektspeicher muss derselbe Lauf zusätzlich Objektversionen und Manifest
sichern; bis dahin darf das Dokument-Storage-Gate nicht als erledigt gelten.

## Verschlüsseltes Backup

Das Image wird reproduzierbar aus PostgreSQL 17 und Restic 0.18.1 gebaut:

```sh
docker build -f database/backup/Dockerfile -t schaefchen-backup:0.45.0 database/backup
```

Der Scheduler stellt `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`,
`RESTIC_REPOSITORY` und die nur lesbar eingehängte
`RESTIC_PASSWORD_FILE` bereit. Nur bei der bewussten ersten Einrichtung wird
`BACKUP_INIT_REPOSITORY=true` gesetzt. Danach lautet der Auftrag:

```sh
run-encrypted-backup.sh
```

Der Dump fließt ohne unverschlüsselte Zwischenkopie direkt in Restic. Danach
werden Aufbewahrung und Pruning angewandt und ein Daten-Teilscheck ausgeführt.
Fehlschlag, fehlendes Snapshot oder überaltertes letztes Backup lösen Alarm
aus; ein Fehler darf nicht durch einen „queued“-Eintrag in der App als Erfolg
erscheinen.

Die früheren Standardziele `make backup` und `make restore` brechen bewusst
ab, damit kein Klartextdump versehentlich als Produktionssicherung gilt und
keine aktive Datenbank ohne eindeutige Absicht überschrieben wird. Nur für
lokale Testdaten stehen die ausdrücklich bestätigten Ziele
`backup-local-dev` und `restore-local-dev` bereit.

## Getrennter Restore-Drill

1. Neue, leere Datenbank in der Restore-Umgebung anlegen. Der Name endet
   zwingend auf `_restore` oder `_restore_drill`.
2. Die Restore-Kennung muss Eigentümerin der Zieldatenbank sein und die beiden
   gruppenbasierten NOLOGIN-Rollen anlegen dürfen. Objektberechtigungen werden
   bewusst mitgesichert; nach dem Drill bleibt keine öffentlich freigegebene
   Ersatzkonfiguration zurück.
3. Niemals Produktions-`DATABASE_URL` oder Produktionsobjektspeicher an den
   Drill geben.
4. Repository und Passwortdatei nur für den Drill einhängen.
5. `RESTORE_CONFIRMATION=RESTORE_DRILL` setzen und ausführen:

```sh
run-restore-drill.sh
```

Das Skript führt einen vollständigen Restic-Datencheck aus, liest das jüngste
Snapshot, stellt mit `pg_restore --clean --if-exists --exit-on-error` nur in
der ausdrücklich benannten Drill-Datenbank wieder her und prüft Tabellen,
Versionsverzeichnis, RLS und die eingeschränkten API-Berechtigungen. Ein Lauf
über vier Stunden schlägt fehl. Die CI führt
denselben Ablauf mit einem frisch erzeugten Ziel aus; der monatliche
Produktionsdrill muss zusätzlich die echte Speicher- und Providerkette nutzen.

## Nachweis je Lauf

Im unveränderlichen Betriebsprotokoll stehen mindestens:

- Quellumgebung und Snapshot-ID, jedoch keine Zugangsdaten,
- Start, Ende, gemessenes RTO und Alter des Snapshots als gemessenes RPO,
- vollständiger/teilweiser Integritätscheck und fachliche Prüfsummen,
- Name von ausführender und gegenprüfender Person,
- Abweichung, Ticket und Frist zur Behebung.

Vor Produktionsfreigabe muss ein bezahlter Datenbankplan mit nachgewiesenem
PITR gewählt sein. Render stellt PITR nach aktueller Dokumentation nur für
bezahlte PostgreSQL-Datenbanken bereit:
[Render Postgres Recovery and Backups](https://render.com/docs/postgresql-backups).
