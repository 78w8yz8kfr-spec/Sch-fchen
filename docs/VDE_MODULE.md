# Integriertes VDE-Prüfmodul

Stand: 01.08.2026
Technischer Stand: V0.41.0

## Ziel und Grenze

Das VDE-Modul ist die kontrollierte Weiterentwicklung der vorhandenen
V15-Prüfprotokoll-Anwendung. Es läuft nicht als zweites Kundensystem, sondern
als aktivierbarer Facharbeitsbereich einer konkreten Schäfchen-Baustelle.

Schäfchen bleibt führend für:

- Firma und Firmenlogo;
- Kunde und Kundenstandort;
- interne Projektzuordnung und Baustelle;
- Benutzer, Rollen und Prüfername;
- zentrale Dokumente und ihre fachlichen Verknüpfungen.

Das VDE-Modul speichert ausschließlich die technischen Prüfdaten und Referenzen
auf diesen gemeinsamen Bestand. Firma, Kunde, Baustelle und Prüfer werden nicht
als bearbeitbare Textkopien in `protocol_data` abgelegt.

## Aktivierung und Sichtbarkeit

Nur Administrator oder Geschäftsführung schalten VDE firmenweit
versionsgeschützt frei. Bei deaktiviertem Modul gibt es keinen VDE-Einstieg in
der Baustellenakte und keinen Zugriff über die Fachendpunkte. Deaktivierung
löscht keine Entwürfe, abgeschlossenen Prüfungen, Historien oder Dokumente.

DGUV ist weiterhin nur technisch vorbereitet. Es bleibt unsichtbar und kann
nicht aktiviert werden. Gemäß verbindlichem Fahrplan beginnt seine fachliche
Umsetzung erst nach V1.0. KNX und LWL gehören nicht zum vorgesehenen
Modulumfang.

## Rollen

| Rolle oder Situation | Lesen | Entwurf | Abschluss | V15-Import |
| --- | --- | --- | --- | --- |
| Administrator / Geschäftsführung | alle aktiven Baustellen | ja | als selbst eingetragener Prüfer | ja |
| Büro/Disposition | alle aktiven Baustellen | ja | nein | ja |
| Projektleitung | alle aktiven Baustellen | ja | als selbst eingetragener Prüfer | ja |
| Vorarbeiter mit Tageseinsatz | zugewiesene Baustelle am betreffenden Tag | ja | als selbst eingetragener Prüfer | nein |
| Monteur mit Tageseinsatz | zugewiesene Baustelle am betreffenden Tag | ja | nein | nein |
| Feldmitarbeiter ohne passenden Einsatz | nein | nein | nein | nein |

Planungsrollen dürfen einen aktiven Mitarbeiter als Prüfer auswählen.
Feldmitarbeiter können ausschließlich sich selbst als Prüfer verwenden. Ein
Prüfer bleibt nach Anlage der Prüfung unveränderlich mit ihr verbunden.
Die Prüferunterschrift darf nur durch genau dieses angemeldete Konto gesetzt
werden; eine Planungs- oder Leitungsrolle darf nicht stellvertretend unter einem
anderen Prüfernamen abschließen.

## Fachstruktur

`vde_inspections.protocol_data` verwendet Schema-Version 1 und enthält:

- Netzform und Nennspannung;
- Erst-, Wiederholungs- und Änderungsprüfung;
- acht Ergebnisse aus Besichtigen und Erproben;
- Hausanschluss beziehungsweise Einspeisung;
- geordnete Verteilungen;
- je Verteilung geordnete FI/RCD-Gruppen und direkte Stromkreise;
- Leitung, Adernzahl und Querschnitt jedes Stromkreises;
- Schutzorgan und ausschließlich dafür relevante Parameter;
- Messwerte, Prüfgerät, Mängel, Gesamtergebnis und nächsten Prüftermin.

Unterstützte Schutzorgane sind:

- Leitungsschutzschalter mit Charakteristik und Nennstrom;
- FI/LS zusätzlich mit FI-Typ, FI-Charakteristik,
  Bemessungsdifferenzstrom und Prüftastenbestätigung;
- NH-, Diazed- und Neozed-Sicherung mit Nennstrom und freier Baugrößen- oder
  Einsatzbezeichnung;
- sonstiges Schutzorgan mit Nennstrom und freier Bezeichnung.

Nennströme sind nicht auf 40 A begrenzt. Dadurch können beispielsweise
NH-Sicherungen mit 63 A oder höheren, fachlich zulässigen Werten erfasst
werden.

## Messwerte und Darstellung

Jeder Stromkreis führt RPE, RISO, Zi, Zs und Ik als getrennte Werte. Die
Oberfläche zeigt keinen abgeleiteten Ia-Wert als Messergebnis. Befindet sich ein
Stromkreis hinter einem FI/RCD oder besitzt er ein integriertes FI/LS, liegen
RCD-Auslösezeit und RCD-Auslösestrom direkt an diesem Stromkreis. Sie werden
nicht als vermeintlich einmaliger Messwert der FI/RCD-Gruppe gespeichert.

Das Stromkreisverzeichnis ist optional. Die detaillierte Isolationsmessung mit
RISO L1-PE, L2-PE, L3-PE und N-PE wird nur angezeigt, gespeichert und
ausgegeben, wenn sie für die Prüfung ausdrücklich gewählt wurde.

Die Reihenfolge von Verteilungen, FI/RCD-Gruppen und Stromkreisen ist fachlich
relevant. Pfeilaktionen ändern sie bewusst; es gibt keine automatische
alphabetische Sortierung. API und PDF übernehmen die Array-Reihenfolge
unverändert.

## Plausibilitätsanzeige

Der Editor kennzeichnet fehlende Messwerte und einfache auffällige
Konstellationen, unter anderem RISO unter 1 MΩ, ungewöhnlich hohen RPE oder Zi,
fehlende Zs-/Ik-Werte sowie RCD-Auslösezeit oder -strom außerhalb der erfassten
Parameter. Für bekannte B-, C- und D-Leitungsschutzschalter werden Zs und Ik
zusätzlich gegen die hinterlegte Auslösekennlinie plausibilisiert.

Diese Anzeige ist eine Eingabehilfe. Sie ersetzt nicht die Auswahl der
anzuwendenden Norm, die Messung, die fachliche Bewertung oder die
Verantwortung der Elektrofachkraft. Deshalb erzeugt sie keine frei erfundenen
Fehlercodes und entscheidet nicht selbst über die Betriebsfähigkeit.

## Entwurf, Historie und Abschluss

Die Browseroberfläche bewahrt ungespeicherte Fachdaten lokal pro Baustelle oder
Prüfung. Eine Unterschrift wird bewusst nicht in `localStorage` abgelegt.
Serverentwürfe besitzen eine `row_version`; parallele veraltete Änderungen
werden mit Konflikt abgewiesen.

Migration 036 schreibt bei Anlage und jeder Änderung eine vollständige Version
in `vde_inspection_versions`. Weder Prüfung noch Historie dürfen hart gelöscht
werden. Für den Abschluss verlangt die API:

- mindestens eine gewählte Prüfungsart;
- mindestens eine benannte Verteilung;
- mindestens einen benannten Stromkreis;
- eine gültige Prüferunterschrift als PNG.

Die API erzeugt die Abschluss-PDF serverseitig und setzt den Datensatz in
derselben Transaktion auf `completed`. Danach sind Fachdaten, Prüfer,
Unterschrift, Abschlusszeitpunkt und Dokumentreferenz unveränderlich.

## Abschluss-PDF

Die PDF ist A4-Hochformat. Seite eins enthält:

- festes Firmenlogo und Firmenfußzeile;
- Prüfnummer, Auftraggeber, Baustelle, Adresse, Prüfer und Prüfdatum aus dem
  gemeinsamen Bestand;
- kompakte Sicht- und Erprobungsprüfung;
- Einspeisung, Prüfgerät, Ergebnis, Mängel und Prüferunterschrift;
- freie Unterschriftslinie für Auftraggeber oder Betreiber.

Seite zwei beginnt unmittelbar mit Verteilungen, Schutzorganen und Messwerten.
Ein Stromkreisverzeichnis erscheint nur bei Auswahl und beginnt nach allen
Messwertseiten immer auf einer eigenen neuen Seite. Detaillierte Isolationswerte
erscheinen nur bei Auswahl. Das Abschlussdokument wird einmal als `inspection`
in der zentralen Dokumentablage gespeichert und automatisch mit Baustelle sowie
ihren übergeordneten Ebenen verknüpft.

## V15-Bestandsimport

Eine Planungsrolle kann eine V15-JSON-Datei auswählen. Wurde die alte
V15-Anwendung auf demselben Browser-Ursprung verwendet, erkennt der Editor
zusätzlich ihren lokalen Gerätespeicher und kann ihn direkt übernehmen. Der
Browser bildet die bekannten `fields`, Sichtprüfungen, Verteilungen,
FI/RCD-Gruppen und Stromkreise auf Schema-Version 1 ab. Dabei gelten dieselben
Feld-, Größen- und Schutzorganregeln wie für einen neuen Entwurf. Der alte
lokale Stand wird nach erfolgreicher Übernahme nicht automatisch gelöscht.

Optional kann das vorhandene V15-PDF bis 5 MB mitgegeben werden. Die API prüft
Dateiname, Base64-Kodierung und PDF-Signatur und legt das Original unverändert
in der zentralen Baustellenakte ab. Eine in V15 enthaltene alte Unterschrift
wird nicht stillschweigend als neuer Abschluss verwendet. Sie bleibt über das
Original-PDF nachvollziehbar; der integrierte Abschluss wird erneut durch den
ausgewählten Prüfer signiert.

## Tabellen und Endpunkte

- `vde_inspections`: aktueller Entwurf oder unveränderlicher Abschluss;
- `vde_inspection_versions`: vollständige unveränderliche Versionen;
- `documents` und `document_contents`: optionales V15-Original und
  Abschluss-PDF;
- `document_links`: zentrale Verbindung zu Baustelle, Projekt und Kunde.

Die Endpunkte und ihre Sicherheitsgrenzen sind in
[`API_SECURITY.md`](API_SECURITY.md) dokumentiert.
