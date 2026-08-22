# Technisch-organisatorische Maßnahmen – Arbeitsstand

Stand: 22.08.2026 · nicht rechtlich freigegeben

Dieses Dokument ist die technische Eingabe für AVV, TOM-Anlage und
Datenschutzprüfung. Verantwortliche Stelle, Rechtsberatung und Betreiber
müssen es gegen den tatsächlich gewählten Dienst, Verträge und Prozesse
abnehmen.

| Schutzziel | Umgesetzte technische Grundlage | Noch organisatorisch/extern zu belegen |
|---|---|---|
| Vertraulichkeit | Mandanten-RLS, serverseitige Rollen/Objektprüfung, getrennte Plattformrollen, sichere Sitzungen, HTTPS-/DB-TLS-Produktionsgate, Secret-Store-Vorgabe | Berechtigungsmatrix je Betrieb, regelmäßige Rezertifizierung, Personal- und Supportprozess |
| Integrität | Parameterbindung, nummerierte Migrationen, unveränderliches Audit/Fachhistorie, Archivieren statt Fachlöschung, Dateisignatur und Malwareprüfung | Vier-Augen-Freigaben, Änderungsmanagement, Penetrationstest |
| Verfügbarkeit | Healthcheck, migrationssicherer Start, verschlüsseltes Zweitbackup und Restore-Drill-Skripte | bezahltes PITR, Alarmierung, Bereitschaft, gemessene RPO/RTO-Nachweise |
| Belastbarkeit | persistente gestufte Rate-Limits, Kontosperren, Größenlimits, begrenzte DB-Pools | WAF/DDoS-Leistung des Providers, Last- und Dauertest |
| Nachvollziehbarkeit | namentliche Plattformkonten, Begründung, Sitzung, Ziel und Ergebnis im Audit; Supportzugriffe zeitlich begrenzt | Log-Aufbewahrung, Auswertung, Alarmregeln, Zugriff auf Protokolle |
| Datenminimierung | kein Dauer-GPS, Tenant-/Benutzerfelder nicht aus Client, Rate-Limit-Kennungen nur als HMAC | endgültige Feldprüfung, OCR/KI/Sprache nur nach gesonderter Freigabe |
| Löschen/Aufbewahren | Deaktivierung, Archivierung, Wiederherstellungsfrist und Datenschutz-Workflow sind modelliert | verbindliche Fristen je Datenart, gesetzliche Ausnahmen, Mandantenexport und geprüfte physische Löschung in DB/Objektspeicher/Backups |

Vor Aufnahme echter Daten werden Datenarten, Zweck, Rechtsgrundlage,
Betroffenenkreis, Empfänger, Speicherort, Regelfrist, Sperrgrund und
Löschverfahren in einem freigegebenen Verzeichnis zusammengeführt. Backups
werden nicht punktuell verändert; Löschungen wirken im Primärsystem, und
abgelaufene Sicherungen verschwinden nach der genehmigten Retention. Bei einer
Wiederherstellung müssen seit dem Snapshot wirksam gewordene Lösch- und
Sperraufträge erneut angewandt und protokolliert werden.

Offen bleiben insbesondere Betreiber/Region, AVV und Unterauftragnehmer,
Supportrollen, Kontakt- und Meldeweg, Aufbewahrungsfristen sowie die externe
Rechtsprüfung. GitHub-Ticket #19 darf erst nach dokumentierter fachlicher und
rechtlicher Abnahme geschlossen werden.
