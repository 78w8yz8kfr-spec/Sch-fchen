# Verbindlicher Backlog

Stand: 01.08.2026

Der GitHub-Backlog und dieses Dokument verwenden dieselben Prioritäten,
Kategorien und Abnahmeregeln. Ein Issue darf erst geschlossen werden, wenn der
dort genannte Nachweis verlinkt oder als Datei beigefügt ist.

## Prioritäten

| Priorität | Bedeutung |
| --- | --- |
| P0 | Datenverlust, Mandantenleck oder Anmeldung beziehungsweise Zeiterfassung unbenutzbar; sofortige Bearbeitung und Release-Stopp. |
| P1 | Ein Hauptablauf ist blockiert; keine Freigabe der betroffenen Etappe. |
| P2 | Deutliche Einschränkung mit dokumentiertem Umweg. |
| P3 | Verbesserung, Komfort oder Optimierung ohne blockierten Hauptablauf. |

## Kategorien

Jedes Issue erhält mindestens eine fachliche Kategorie:

- Mobil
- Desktop
- API
- Datenbank
- Offline
- PDF
- Berechtigungen
- Sicherheit
- Infrastruktur

Zusätzlich erhält jedes Issue genau eine Priorität `P0`, `P1`, `P2` oder `P3`.
Ein Etappen- oder Release-Label darf ergänzend verwendet werden.

## Offene Release-Gates

| Priorität | Kategorien | Gate | Abschlussnachweis |
| --- | --- | --- | --- |
| P1 | Mobil, Offline | [#11 iPhone-PWA-Abnahme](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/11) | Geräte-/OS-/Browserstand, Testfälle, Ergebnisse und Screenshots; Installation, Neustart, Netzwechsel, Warteschlange und Update bestanden |
| P1 | Mobil, Offline | [#12 Android-Chrome-Abnahme](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/12) | Geräte-/OS-/Browserstand und dieselben Offline-/Updatefälle bestanden |
| P1 | Desktop | [#13 Chrome-/Edge-Abnahme der Plantafel](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/13) | Wochen-/Monatsansicht, Filter, Drag-and-drop, Teamvorlage, Konflikte und Tastaturbedienung protokolliert |
| P1 | API, Datenbank | [#14 Last- und Datenmengentest](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/14) | 10.000 Mitarbeiter, mehrjährige Zeiten, große Dokumentlisten, Gleichzeitigkeit, Pagination, Exportdauer und Speicherwerte dokumentiert |
| P1 | Infrastruktur, Sicherheit | [#15 Zielplattform und getrennte Umgebungen](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/15) | freigegebene Entscheidung sowie getrennte Entwicklung, Staging und Produktion |
| P1 | Infrastruktur, Datenbank | [#16 Backup, PITR und Wiederherstellungsprobe](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/16) | vollständige Datenbank- und Dokumentwiederherstellung; gemessenes RPO ≤ 15 Minuten und RTO ≤ 4 Stunden |
| P1 | Infrastruktur | [#18 Monitoring und Alarmierung](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/18) | Uptime-, API-, DB-, Speicher- und Synchronisationsalarme; simulierter Ausfall löst nachweislich Alarm aus |
| P1 | Sicherheit, API | [#17 Produktionshärtung](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/17) | Schadsoftwareprüfung für Uploads, Rate Limits, Passwortzurücksetzung und dokumentierter Admin-Notzugang |
| P1 | Sicherheit, Berechtigungen | [#19 Datenschutz- und Vertragsfreigabe](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/19) | AVV, TOM, Aufbewahrung/Löschung, Impressum und Vertragsunterlagen extern geprüft |
| P1 | Mobil, Desktop, API, Offline | [#20 Vierwöchiger Gesamtpilot](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/20) | vier Wochen ohne P0, keine ungeklärten Datenabweichungen und gemessene Pilotkennzahlen |
| P2 | PDF | [#21 Vollständige Viewer-/Druck-Grenzfallmatrix](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/21) | alle PDF-Arten mit langen Texten, Logos, mehreren Mitarbeitern/Berichten und Seitenumbrüchen in Ziel-Viewern geprüft |
| P2 | Infrastruktur | [#22 Onboarding, Support und Störungsprozess](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/22) | Kurzanleitungen für Admin/Büro/Monteur, Update-/Störungsweg und Verantwortliche freigegeben |
| P2 | API, Datenbank | [#23 Preis- und Lizenzmodell](https://github.com/78w8yz8kfr-spec/Sch-fchen/issues/23) | technisch abbildbares, fachlich freigegebenes Modell vor V1.0 |

Die verlinkten GitHub-Issues sind die operative Quelle. Der idempotente
Workflow `.github/workflows/roadmap-metadata.yml` stellt die zugehörigen
Prioritäts-, Kategorie- und Release-Gate-Labels im öffentlichen Repository
bereit.

## Definition of Done

Eine Produktänderung ist erst fertig, wenn alle zutreffenden Punkte erfüllt
sind:

1. fachlicher Ablauf und Fehlerfälle sind beschrieben;
2. Datenänderungen besitzen eine nummerierte, idempotente Migration;
3. Mandantentrennung, Rollen und direkte Objektberechtigung werden serverseitig
   geprüft;
4. Originale und abgeschlossene Fachdaten werden nicht hart gelöscht oder
   unbemerkt überschrieben;
5. Versionskonflikte und wiederholte Übertragung sind berücksichtigt;
6. Unit-, Validierungs-, SQL-, PostgreSQL-Integrations- und PWA-Smoke-Tests sind
   je nach Änderung ergänzt;
7. PDFs werden zusätzlich gerendert und visuell geprüft, wenn sich Inhalt oder
   Layout ändert;
8. Dokumentation, Changelog, sichtbare Versionsanzeige und PWA-Cache-Version
   sind konsistent;
9. der exakte Commit besitzt grüne GitHub-CI;
10. erforderliche reale Geräte-, Infrastruktur-, Rechts- oder Pilotabnahmen
    sind als belegte Gates abgeschlossen und werden nie durch einen simulierten
    Haken ersetzt.

## Release-Regel

- Offene P0- oder P1-Fehler blockieren die betroffene Freigabe.
- Ein Funktionsrelease darf externe Gates ausdrücklich offen ausweisen, solange
  es nicht als Produktions- oder V1.0-Freigabe bezeichnet wird.
- V1.0 bleibt gesperrt, solange auch nur ein P1-Gate aus der
  Fahrplan-Abnahme offen ist.
