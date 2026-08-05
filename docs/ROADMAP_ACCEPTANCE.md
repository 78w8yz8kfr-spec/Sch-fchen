# Fahrplan-Abnahme

Stand: 01.08.2026
Geprüfter Produktstand: V0.42.0

Dieses Dokument gleicht den Fahrplan
`Schäfchen – Fahrplan von V0.35.0 bis V1.0` mit dem tatsächlich belegbaren
Projektstand ab. Ein Punkt gilt nur dann als abgeschlossen, wenn ein
nachvollziehbarer Nachweis vorhanden ist. Implementierung, automatischer Test
und reale Betriebsabnahme werden bewusst nicht gleichgesetzt.

## Statusregeln

| Status | Bedeutung |
| --- | --- |
| Erfüllt | Implementierung und der dafür verfügbare automatische Nachweis sind vorhanden. |
| CI-Gate | Lokal prüfbar; PostgreSQL-Migration und Integration müssen für den exakten Commit in GitHub Actions grün sein. |
| Externe Abnahme | Benötigt reale Geräte, reale Cloud-Ressourcen, einen Menschen oder einen längeren Zeitraum und darf nicht simuliert als bestanden markiert werden. |
| Offen | Noch nicht umgesetzt oder noch ohne ausreichenden Nachweis. |
| Später | Gehört laut Fahrplan erst in eine spätere Etappe. |

## Versionszuordnung

Die historischen Repository-Versionen und die Etappennummern des später
erstellten Fahrplans sind nicht deckungsgleich. Insbesondere enthalten die
Repository-Releases V0.36 bis V0.40 bereits Abwesenheiten, Stundenkonten,
Feiertage, VDE und die erste Bereichsnavigation. V0.41.0 schließt deshalb die
noch fehlenden fachlichen Punkte bis zur Fahrplan-Etappe
„Berichte und Baustellenakte 2.0“, ohne alte Releases nachträglich falsch
umzubenennen.

VDE ist technisch bereits vorgezogen umgesetzt. Das ändert die verbindliche
Reihenfolge nicht: DGUV bleibt ausdrücklich erst nach V1.0 vorgesehen.

## Ergänzende Abnahme V0.42

Die Plattformverwaltung und die vertieften Korrekturabläufe erweitern den
ursprünglichen Fahrplan, ohne dessen noch offene reale Betriebsnachweise als
erfüllt umzudeuten.

| Kriterium | Status | Nachweis oder Restarbeit |
| --- | --- | --- |
| Vollständige Zeitbearbeitung ohne Dublette | CI-Gate | Migration/SQL-Test 042, PostgreSQL-Integration, API- und PWA-Test |
| Freigabe- und Abrechnungsgrenze mit Audit | CI-Gate | `time_change_operations`, unveränderliches Audit, positive und negative SQL-Fälle |
| Pausen-, Tages-, Wochen- und Zeitkontoneuberechnung | CI-Gate | Rechenregel 4, SQL-Test 042 und PostgreSQL-Integration |
| Mobile Baustellenanlage bei kleinem Viewport | Erfüllt | PWA-Smoke-Test für Scrollcontainer, Safe Area, Fokus-Scroll, Sticky-Aktion und Inlinefehler |
| Reale Bildschirmtastatur auf iOS/Android | Externe Abnahme | Je ein kleines und großes Telefon sowie Tablet mit geöffneter Tastatur protokollieren |
| Mitarbeiter hart löschen, archivieren und reaktivieren | CI-Gate | Migration/SQL-Test 043 und PostgreSQL-Integration |
| Ruhige Wochenstruktur, kompaktes Arbeitskonto und Feiertags-Disclosure | Erfüllt | Markup-/PWA-Smoke-Test; reale visuelle Geräteabnahme bleibt zusätzlich offen |
| Systemadministrator ohne Firma und eigene Navigation | CI-Gate | Migration/SQL-Test 039/044 und Plattform-Anmeldeintegration |
| Firmen-, Konto-, Tarif-, Modul- und Registrierungsverwaltung | CI-Gate | Migration/SQL-Test 039–041/044 und PostgreSQL-Integration |
| Firmen können Spezialmodule nicht selbst aktivieren | CI-Gate | negativer Firmen-API-Fall und positiver Plattform-API-Fall |
| Protokollierter, befristeter Supportmodus | CI-Gate | Supportstart, Kontext, Ende und Ablehnung eines beendeten Kontexts in der Integration |
| Plattformrollen und unveränderliches Audit | CI-Gate | SQL-Tests 039/041 und negative API-Rechtefälle |
| Wartungsmodus und verpflichtende App-Version | CI-Gate | Unit-Test des Versionsvergleichs und PostgreSQL-Laufzeittest |
| Mandantentrennung einschließlich Direkt-IDs und RLS | CI-Gate | alle SQL-Tests sowie positive/negative PostgreSQL-Integration |
| Produktionsbackup, Alarmierung und echte Wiederherstellung | Externe Abnahme | isolierte Zielinfrastruktur, Integritätsprüfung und Vier-Augen-Protokoll erforderlich |

## Etappe 0 – Bestandsbereinigung

| Kriterium | Status | Nachweis oder Restarbeit |
| --- | --- | --- |
| V0.35.0 taggen und als Release festhalten | CI-Gate | Der idempotente Metadaten-Workflow veröffentlicht den belegten Commit `21997c1` nach dem Merge als Tag und GitHub-Release. |
| Veröffentlichte Changelog-Einträge aus `Unreleased` lösen | Erfüllt | `CHANGELOG.md` besitzt getrennte Versionsabschnitte; V0.42.0 ist dokumentiert. |
| Projektstatus korrigieren | Erfüllt | `docs/PROJECT_STATUS.md` nennt V0.42.0, trennt Demo und Produktion und verweist auf V0.50 statt DGUV. |
| Echten GitHub-Backlog anlegen | Erfüllt | Die öffentlichen Issues #11 bis #23 enthalten Priorität, Kategorien, Prüfumfang und Abschlussnachweis; `docs/BACKLOG.md` verlinkt sie. |
| Einheitliche P0-P3-Prioritäten und Kategorien | Erfüllt | Definitionen und Kategorien stehen in `docs/BACKLOG.md`. |
| Einheitliche Definition of Done | Erfüllt | Siehe Abschnitt „Definition of Done“ in `docs/BACKLOG.md`. |

## Etappe 1 – Kernabnahme

### Automatisierbare Kernabläufe

| Bereich | Status | Nachweis |
| --- | --- | --- |
| Anmeldung, Startpasswort, Rollen und Sitzungen | CI-Gate | `api/tests/postgres-integration.test.mjs`, Sicherheits- und Validierungstests |
| Kunde, Baustelle, Einsatz und mehrere Einsätze pro Tag | CI-Gate | PostgreSQL-Integration, Migrationen 004 bis 012 und 027 |
| Zeiterfassung, Wiederbeginn, Offline-Idempotenz und Synchronisationsreihenfolge | CI-Gate | PostgreSQL-Integration, Sicherheits-/Validierungstests, Service Worker |
| Feldbaustelle, Vorarbeiter und automatische Berichtsverantwortung | CI-Gate | PostgreSQL-Integration, Migrationen 024, 026 und 032 |
| Berichtsentwurf, Wiederverwendung, Rückgabe und Abschluss | CI-Gate | Berichts-, PDF-, Validierungs- und PostgreSQL-Integrationstests |
| Zeitkorrektur, Ergänzung, Ungültigmarkierung, Freigabe und Abrechnung | CI-Gate | PostgreSQL-Integration und Migrationen 031/032 |
| Persönlicher und Büro-PDF-/Excel-Export | Erfüllt | PDF-, Export- und Validierungstests |
| Firmen- und Mitarbeitergrenzen | CI-Gate | RLS-SQL-Tests und PostgreSQL-Integration |
| Projektleiter sieht nur zugeordnete Bereiche | CI-Gate | Historisierte `project_responsibles`, serverseitige Projekt-/Baustellen-/Dokumentschranken und positive sowie negative PostgreSQL-Integrationstests |

### Geräte, Offline und Update

| Kriterium | Status | Verbindliche Abnahme |
| --- | --- | --- |
| Installierte PWA auf iPhone | Externe Abnahme | Reales unterstütztes iPhone, Installation, Neustart, Offline-Buchung und Update protokollieren. |
| Android mit Chrome | Externe Abnahme | Reales unterstütztes Android-Gerät mit denselben Fällen prüfen. |
| Desktop Chrome und Edge | Externe Abnahme | Aktuelle stabile Versionen, Plantafel, PDFs und Tastaturbedienung prüfen. |
| WLAN, Mobilfunk und vollständig offline | Externe Abnahme | Netzwechsel während offener Buchungen und Berichte reproduzierbar testen. |
| Abgelaufene Sitzung und PWA-Update mit Warteschlange | Externe Abnahme | Reale Sitzung ablaufen lassen; lokale Einträge müssen nach Neuanmeldung erhalten bleiben. |
| Wiederholtes Absenden von Buchung, Bericht, Foto und Notiz | CI-Gate | Idempotenz ist implementiert; reale Gerätewiederholung bleibt zusätzlich erforderlich. |

### PDF-Abnahme

| Kriterium | Status | Nachweis oder Restarbeit |
| --- | --- | --- |
| VDE-Seitenfolge und A4-Ausgabe | Erfüllt | Unit-Test plus visuelles Rendering aller drei Seiten am 29.07.2026 |
| Messwerte ab Seite 2 | Erfüllt | `api/tests/vde-pdf.test.mjs` und visuelle Prüfung |
| Stromkreisverzeichnis auf eigener Folgeseite | Erfüllt | `api/tests/vde-pdf.test.mjs` und visuelle Prüfung |
| Bericht-PDF mit langen Texten und Bildseiten | Erfüllt | PDF-Tests, automatischer Seitenumbruch und eigene Seite je Berichtsfoto |
| Vollständige Grenzfallmatrix aller Exporte | Externe Abnahme | Große/kleine Logos, Sammelumfang und Druck in realen PDF-Viewern protokollieren. |

### Last und Datenmenge

| Kriterium | Status | Verbindliche Abnahme |
| --- | --- | --- |
| 10.000 Mitarbeiter | Externe Abnahme | Synthetischen, isolierten Lastdatensatz erzeugen und Laufzeiten dokumentieren. |
| Mehrjährige Buchungen und große Listen | Externe Abnahme | Pagination, Indizes, Exportdauer und Speicher messen. |
| Gleichzeitige Wochenplan-/Stundenzettelabfragen | Externe Abnahme | Definierten Lasttest gegen eine Staging-Umgebung ausführen. |

## Etappe 2 – Produktionsgrundlage

Die Anwendung besitzt Container-, Migrations-, Backup-/Restore- und
Sicherheitsgrundlagen. Die eigentliche Produktionsabnahme ist jedoch nicht
durch Repository-Code ersetzbar.

| Kriterium | Status | Verbindliche Abnahme |
| --- | --- | --- |
| Zielplattform entscheiden | Externe Abnahme | Entscheidung mit Verantwortlichem und Kosten-/Datenschutzprüfung festhalten. |
| Entwicklung, Staging und Produktion trennen | Externe Abnahme | Drei getrennte Umgebungen und Geheimnisse nachweisen. |
| Verschlüsselte Backups und PITR | Externe Abnahme | Providerkonfiguration und Aufbewahrung dokumentieren. |
| Wiederherstellungsprobe, RPO ≤ 15 min, RTO ≤ 4 h | Externe Abnahme | Datenbank und Dokumente in getrennter Umgebung vollständig wiederherstellen. |
| Uptime-, API-, DB-, Speicher- und Synchronisationsalarm | Externe Abnahme | Simulierten Ausfall auslösen und Empfang des Alarms dokumentieren. |
| Keine Geheimnisse im Repository/Browserpaket | CI-Gate | Repository-Prüfung und Produktionskonfiguration kontrollieren. |
| Upload-Schadsoftwareprüfung, Rate Limits, Reset und Notzugang | Offen | Vor echten Betriebsdaten vervollständigen. |
| Datenschutz-, AVV-, TOM-, Impressums- und Vertragsprüfung | Externe Abnahme | Fachanwaltliche Freigabe erforderlich. |

## Etappe 3 – Abwesenheiten

| Kriterium | Status | Nachweis |
| --- | --- | --- |
| Arten, halbe/ganze Tage und Zeiträume | CI-Gate | Migration 033, Validierungs- und Integrationstests |
| Zweistufige Freigabe mit Vier-Augen-Regel | CI-Gate | Migration 033 und PostgreSQL-Integration |
| Erst Stufe 2 blockiert die Planung | CI-Gate | SQL- und Integrationstest |
| Ablehnung, Rückgabe/Aufhebung und Pflichtbegründung | CI-Gate | Ereignishistorie und Versionsschutz |
| Konflikt mit vorhandenen Einsätzen | CI-Gate | Gemeinsame transaktionale Mitarbeiter-Tag-Sperre |
| Anzeige in Woche, Tageslage und persönlicher Ansicht | Erfüllt | PWA-Smoke-Test und Oberflächenimplementierung |
| Krankheit eigener Status | Erfüllt | Eigene Art und unmittelbarer dokumentierter Ablauf |

## Etappe 4 – Desktop-Plantafel

| Kriterium | Status | Nachweis |
| --- | --- | --- |
| Wochen- und Monatsansicht | Erfüllt | Desktop-Plantafel in `frontend/app.js` |
| Mitarbeiterzeilen und feste Teamvorlagen | CI-Gate | Migration 038, Team-API und PWA-Smoke-Test |
| Abwesenheiten und Einsätze gemeinsam | Erfüllt | Wochenraster mit Konfliktkennzeichnung |
| Drag-and-drop mit Pflichtbegründung | CI-Gate | Zielübernahme in versionsgeschützte Änderungsmaske |
| Mehrere Baustellen pro Tag | CI-Gate | Bestehendes Sequenzmodell und Integrationstest |
| Start, Dauer und Arbeitsanweisung | Erfüllt | Direkt auf Planungskarten und in Anlage/Bearbeitung |
| Kopieren und Mehrfachzuweisung | CI-Gate | Batch-Endpunkt erzeugt einzelne Mitarbeitereinsätze |
| Überschneidung, Abwesenheit, fehlender Vorarbeiter | CI-Gate | Serverseitige Zeitkollision plus sichtbare Konfliktprüfung |
| Filter Mitarbeiter, Team, Baustelle, Projektleiter, Status | Erfüllt | Plantafel-Werkzeugleiste |
| Nicht eingeplante Feldmitarbeiter | Erfüllt | Eigene Kennzeichnung und Filter |
| Excel-Import bleibt erhalten | Erfüllt | Bestehender Vorschau-/Importablauf |
| Mobile Ansicht bleibt einfach | Erfüllt | Plantafel liegt ausschließlich in der Planungsansicht |

## Etappe 5 – Berichte und Baustellenakte 2.0

| Kriterium | Status | Nachweis |
| --- | --- | --- |
| Zentrale Berichtszentrale mit allen Filtern | Erfüllt | `report-center` in der Büroansicht |
| Fehlende Pflichtberichte und klare Status | Erfüllt | Kennzahlen, Fehlend-Liste, offen/zurückgegeben/abgeschlossen |
| Rückgabe mit Kommentar und erneute Einreichung | CI-Gate | Migration 037, API und Integrationstest |
| Automatische Entwurfssicherung | Erfüllt | Benutzer-/Baustellen-/Erfassungsart-bezogener lokaler Entwurf |
| PDF-Vorschau vor Unterschrift | Erfüllt | Vorschau-Endpunkt und Test |
| Stammdaten, Team und Stunden automatisch | CI-Gate | Serverseitige Referenzen und Personalprüfung |
| Fotos mit Bildunterschrift | CI-Gate | Strukturierte Fotozuordnung und eigene PDF-Bildseiten |
| Logisch getrennte Berichtsfelder | Erfüllt | Eigene Abschnitte für Leistungen, Material, Behinderung, offene Punkte, Absprachen, Witterung und Vorfälle |
| Keine doppelte Projektzeile | Erfüllt | Berichtsausgabe zeigt Kunde und Baustelle |
| Abschluss-PDF unveränderlich | CI-Gate | Dokument- und Berichtssperren |
| Verbindliche Reihenfolge der Baustellenakte | Erfüllt | Getrennte Bereiche in Mobile und Büro |
| Rollenstandard und zuletzt benutzter Bereich | Erfüllt | Rollenabhängige Auswahl und lokaler Merker |
| Suche in Berichten, Dokumenten und Fotos | Erfüllt | Je Bereich eigenes Suchfeld |
| Mobile Dokumentfreigabe und Offline-Markierung | CI-Gate | Migration 037, API, Service Worker und Tests |
| Berechtigungsgeprüfter QR-Direktlink | CI-Gate | Stabiler QR-Schlüssel, QR-Endpunkt und Zugriffsprüfung |
| Keine zweite Projektebene und kein Projektchat | Erfüllt | Flache Baustellenbedienung; Notizen bleiben baustellenbezogen |

## Etappe 6 – VDE-Integration

Die VDE-Integration wurde technisch vorgezogen.

| Kriterium | Status | Nachweis |
| --- | --- | --- |
| Gemeinsamer Login, Mandant und Stammdaten | CI-Gate | Gemeinsame API-Session und Referenzen |
| Aktivierung nur durch berechtigte Plattformrolle | CI-Gate | Plattform-Entitlement mit Historie und negativer Firmen-API-Fall |
| Prüfung aus Baustelle, strukturierte Fachdaten und Plausibilität | CI-Gate | Migration 036, Editor und Tests |
| Passende Schutzorganparameter und optionale Detailfelder | Erfüllt | Validierungs- und PWA-Tests |
| Unterschrift, unveränderliche PDF und zentrale Ablage | CI-Gate | PDF-/Integrations-/SQL-Tests |
| V15-Import mit unverändertem Original | CI-Gate | Import- und PDF-Tests |
| Kern bleibt bei deaktiviertem Modul nutzbar | CI-Gate | Modulgrenzen und Integrationstest |

## Spätere Etappen

- V0.60 Azubi-Modul: Erste Ausbaustufe gebaut — Wochenberichte, Berufsschule,
  Urlaub/Krankheit, Unterschriften, Sammelfreigabe, Rückgabe und
  unveränderlicher Verlauf (siehe `docs/APPRENTICE_REPORTS.md`). Offen
  bleiben PDF-Ausdruck für die Kammer, Erinnerungen an fehlende Wochen und
  Tagesberichte.
- V0.90 Pilot: Externe Abnahme, noch nicht begonnen.
- V1.0: Darf erst nach allen Produktions-, Rechts-, Geräte-, Last- und
  Vier-Wochen-Pilot-Gates freigegeben werden.
- DGUV: laut Fahrplan erst nach V1.0.

## Freigaberegel

V0.42.0 kann als Funktionsstand veröffentlicht werden, sobald der exakte Commit
die vollständige GitHub-CI einschließlich aller Migrationen, SQL-Tests und des
PostgreSQL-Integrationstests bestanden hat. Diese Veröffentlichung ist keine
Produktions- oder V1.0-Freigabe. Die als „Externe Abnahme“ oder „Offen“
markierten Punkte bleiben verbindliche Sperren vor echten Betriebsdaten
beziehungsweise V1.0.
