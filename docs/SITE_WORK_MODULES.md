# Baustellenarbeit: Aufgaben, Notizen, Material und Berichte

Stand: 29.07.2026
Technischer Stand: V0.34.0

## Bedienkonzept

Die Baustelle bleibt der Arbeitsort. Aufgaben, Notizen, Material und Berichte erscheinen
deshalb ausschließlich als ruhige, aufklappbare Themenbereiche im
Baustellen-Dashboard. Es gibt keine globale Aktivitätschronik und keine
zusätzlichen Hauptmenüpunkte.

Die Oberfläche folgt den festgelegten Gestaltungsregeln:

- viel Weißraum, einheitliche Karten und klare Typografie;
- Rot nur für die wichtigste Aktion und dringende Zustände;
- mobile Eingaben mit wenigen, großen Bedienelementen;
- nur aktivierte Module sind sichtbar;
- Schäfchen-Struktur und Bedienung bleiben für alle Firmen gleich, während
  Firmenlogo und Akzentfarbe aus dem Mandanten-Branding stammen;
- jede sichtbare Aktion besitzt einen echten, serverseitig geprüften Ablauf.

## Mobile Baustellenakte

Navigation und Baustellenakte sind direkt am aktuellen Tageseinsatz erreichbar.
Die Baustellenakte öffnet die Baustelle als eigenen Arbeitsbereich.
Arbeitsauftrag und Navigation stehen zuerst; darunter folgen
sichtbare, getrennte Karten für Mitarbeiter, Aufgaben, Notizen, Berichte, Dokumente,
Fotos und Material. Die Ansicht ist keine chronologische Pinnwand und erzeugt
keinen zusätzlichen Hauptmenüpunkt.

Monteur und Vorarbeiter benötigen für genau diesen Tag einen freigegebenen oder
abgeschlossenen Einsatz an der Baustelle. Monteure sehen nur eigene und
allgemeine Aufgaben. Vorarbeiter sehen das vollständige Team und alle
Baustelleninhalte. Administrator, Geschäftsführung, Büro/Disposition und
Projektleitung dürfen jede Baustelle des Sitzungsmandanten öffnen.

Die zuletzt erfolgreich geladene Übersicht wird ohne Dateiinhalt lokal
zwischengespeichert. Dadurch bleiben Auftrag, Team und Listen bei einem
Verbindungsabbruch lesbar. Schreibaktionen warten weiterhin auf eine sichere
Serververbindung.

## Aufgaben

`site_tasks` speichert Aufgabe, Beschreibung, Priorität, optionalen Mitarbeiter,
Fälligkeit und Status. Die Statusfolge lautet `open`, `in_progress`, `done` und
optional `archived`. Beim Abschluss setzt PostgreSQL den Abschlusszeitpunkt.
Änderungen verwenden `row_version`; hartes Löschen ist gesperrt.

Ein für den Tag berechtigter Mitarbeiter kann eine für ihn sichtbare Aufgabe
mobil von `open` nach `in_progress`, von `in_progress` nach `done` und von
`done` zurück nach `in_progress` setzen. Normale Monteure dürfen nur allgemeine
oder ihnen selbst zugewiesene Aufgaben ändern; Vorarbeiter dürfen die sichtbaren
Aufgaben ihres Baustellenteams bearbeiten. Archivieren bleibt eine Büroaktion.
Die API prüft Baustelle, Arbeitstag, Einsatz, Mitarbeiterzuordnung,
Statusübergang und `row_version`.

## Material

`site_material_entries` bildet die einfache Baustellenlogistik ab. Ein Eintrag
enthält Bezeichnung, Menge, Einheit, Hinweis und den Stand `planned`, `ordered`,
`available`, `used` oder `archived`. Die mobile Oberfläche führt schrittweise
von „Benötigt“ über „Bestellt“ und „Vor Ort“ bis „Verbraucht“.

## Notizen

`site_notes` speichert kurze Baustellenhinweise bis 2.000 Zeichen mit Verfasser,
Erstellungszeitpunkt und optionaler Wichtig-Markierung. Büro und berechtigt
eingeplante Mitarbeiter verwenden denselben Bestand. Die Darstellung bleibt
ein ruhiger Themenbereich innerhalb der Baustelle und wird nicht zu einer
globalen oder chronologischen Aktivitätsansicht.

Eine vom Client erzeugte UUID macht wiederholtes Absenden idempotent.
Notizinhalte bleiben nach dem Speichern unverändert; für spätere Bereinigung ist
eine nachvollziehbare Archivierung vorbereitet. Hartes Löschen ist gesperrt.

## Baustellenfotos

„Foto aufnehmen“ öffnet auf Mobilgeräten direkt die Kamera. Das Bild wird als
Dokument der Kategorie `photo` einmal gespeichert und automatisch mit
Baustelle, Projekt und Kunde verknüpft. Der eigene Fotobereich ist lediglich
eine thematische Sicht auf denselben zentralen Dokumentbestand und erzeugt
keine zweite Dateikopie.

## Montagescheine und Bautagesberichte

`site_reports` speichert Montageschein oder Bautagesbericht, Arbeitstag, Titel,
Autor, Status und Erfassungsart. `structured_data` enthält ausgeführte
Leistungen, Behinderungen, offene Punkte, Witterung, Material und Geräte,
Absprachen, Vorfälle sowie die serverseitig geprüften Mitarbeiterstunden. Die
PWA summiert die Teamstunden, prüft Pflichtangaben und bewahrt einen noch nicht
abgeschlossenen lokalen Entwurf. Drei gleichwertige Einstiege sind vorgesehen:

1. **Digital erstellen** – Text direkt eingeben.
2. **Papierbericht fotografieren** – das unveränderte Originalfoto einmal im
   zentralen Dokumentenbestand speichern und mit dem Bericht verknüpfen.
3. **Bericht diktieren** – Browser-Spracherkennung in bearbeitbaren Text
   übernehmen; bei fehlender Browserunterstützung bleibt die Texteingabe
   verfügbar.

Berichte erhalten mandantenbezogene Nummern im Format
`SE-R-JJJJ-00001`. Ein fotografierter Bericht ist nur gültig, wenn das
Originaldokument derselben Baustelle zugeordnet ist. Derselbe Datei-Hash erzeugt
keine Dokumentkopie.

## Sicherheitsgrenzen

- Die Firma wird ausschließlich aus der Sitzung übernommen.
- Planungsrollen dürfen Berichte im Baustellen-Dashboard verwalten und abschließen.
- Der mobile Berichts-Endpunkt ist ausschließlich für den am betreffenden Tag
  und an der betreffenden Baustelle berichtspflichtigen Mitarbeiter
  freigeschaltet. Das ist entweder der manuell eingeteilte Vorarbeiter oder bei
  einem Alleineinsatz automatisch der einzige Monteur. Eine allgemeine
  Vorarbeiterrolle allein genügt nicht.
- Baustellen und zugewiesene Mitarbeiter müssen aktiv und im selben Mandanten
  vorhanden sein.
- Fremde Dokumente oder Dokumente einer anderen Baustelle werden abgewiesen.
- RLS, zusammengesetzte Fremdschlüssel, Versionsprüfung und Löschschutz gelten
  für alle Baustellenmodule.

## Freigabe und Abschluss-PDF

Eingereichte Montagescheine und Bautagesberichte werden erst abgeschlossen, wenn
Mitarbeiter beziehungsweise Vorarbeiter und Auftraggeber direkt auf dem Gerät
unterschrieben haben. Die API erzeugt daraus eine PDF-Datei mit dem zu diesem
Zeitpunkt gültigen Firmenlogo sowie historischen Firmen-, Kunden-, Projekt- und
Baustellendaten. PDF und Bericht sind anschließend unveränderlich. Die PDF wird
als zentrales Dokument einmal gespeichert und automatisch mit Kunde, Projekt
und Baustelle verknüpft.

## Mobiler Tagesabschluss

`site_assignments.report_responsible` bestimmt genau einen Verantwortlichen je
Baustelle und Arbeitstag. `report_responsibility_source` unterscheidet die
manuelle Einteilung eines Vorarbeiters von der automatischen Verantwortung bei
einem Alleineinsatz. Beim Antippen von „Baustelle verlassen“ öffnet sich nur
für diesen Mitarbeiter die Auswahl zwischen Montageschein und Bautagesbericht.
Zusätzlich kann derselbe Mitarbeiter den Bericht über die Schnellaktion des
laufenden Einsatzes vorab speichern, ohne dabei die Baustelle zu verlassen.
Beim späteren Verlassen erkennt Schäfchen den vorhandenen Bericht und legt
keine zweite Ausführung an.
Der Bericht wird über `site_assignment_id` unverwechselbar mit dem Einsatz
verbunden. `client_report_id` verhindert auch nach einem Verbindungsabbruch
Doppelanlage.

Ohne Bericht lehnt das Backend die Abfahrtsbuchung mit
`site_report_required` ab. Offline legt die PWA Bericht und Zeitereignis lokal
ab; nach Wiederherstellung der Verbindung synchronisiert sie zuerst den Bericht
und anschließend die Abfahrt. Monteure ohne Berichtsverantwortung behalten den
einfachen bisherigen Zeitablauf.
