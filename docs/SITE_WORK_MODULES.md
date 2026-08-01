# Baustellenarbeit: Aufgaben, Notizen, Material und Berichte

Stand: 01.08.2026
Technischer Stand: V0.41.0

## Bedienkonzept

Die Baustelle bleibt der Arbeitsort. Aufgaben, Notizen, Material und Berichte
erscheinen deshalb ausschließlich als einzeln wählbare Themenbereiche im
Baustellen-Dashboard. Pro Auswahl ist nur der zugehörige Arbeitsbereich sichtbar.
Es gibt keine globale Aktivitätschronik und keine zusätzlichen Hauptmenüpunkte.

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
Die einsatzbezogene Arbeitsanweisung, geplante Startzeit und Dauer sowie die
Navigation stehen zuerst; darunter wählt der Mitarbeiter gezielt Übersicht,
Aufgaben, Notizen, Berichte, Dokumente, Fotos oder Material. Schäfchen zeigt
anschließend nur diesen Bereich. Die Ansicht ist keine chronologische Pinnwand
und erzeugt keinen zusätzlichen Hauptmenüpunkt.

Ist das VDE-Spezialmodul für die Firma aktiviert, folgt als weitere Themenkarte
die Liste der VDE-Prüfungen dieser Baustelle. Der Editor öffnet einen eigenen
ruhigen Arbeitsbereich, übernimmt die gemeinsamen Stammdaten und legt seine
Abschluss-PDF wieder in dieselbe Dokumentenkarte zurück. Fachdetails stehen in
[`VDE_MODULE.md`](VDE_MODULE.md).

Das tagesbezogene Team zeigt Rolle, geplante Einsatzdauer und vorhandene
Telefon- oder E-Mail-Kontaktdaten. Die mobile Kontaktaktion verwendet nur die
bereits für diesen Tag und diese Baustelle freigegebenen Teamdaten.

Monteur und Vorarbeiter benötigen für genau diesen Tag einen freigegebenen oder
abgeschlossenen Einsatz an der Baustelle. Monteure sehen nur eigene und
allgemeine Aufgaben. Vorarbeiter sehen das vollständige Team und alle
Baustelleninhalte. Administrator, Geschäftsführung, Büro/Disposition und
Projektleitung dürfen jede Baustelle des Sitzungsmandanten öffnen.

Die zuletzt erfolgreich geladene Übersicht wird ohne Dateiinhalt lokal
zwischengespeichert. Dadurch bleiben Auftrag, Team und Listen bei einem
Verbindungsabbruch lesbar. Schreibaktionen warten weiterhin auf eine sichere
Serververbindung.

Die Bereichsreihenfolge ist verbindlich: Arbeitsauftrag, Team, Aufgaben,
Berichte, Fotos, Dokumente, Material, Notizen und aktivierte Prüfmodule.
Schäfchen öffnet je Rolle den häufigsten Bereich zuerst und merkt sich den
zuletzt verwendeten Bereich pro Benutzer und Baustelle. Berichte, Fotos und
Dokumente besitzen jeweils eine eigene Suche.

Ein stabiler QR-Code verweist auf die Baustellenakte. Er ersetzt keine
Berechtigung: Nach dem Scannen verlangt Schäfchen eine gültige Anmeldung und
prüft anschließend erneut Rolle beziehungsweise Tageseinsatz.

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

Ausgewählte JPG- oder PNG-Fotos können mit einer Bildunterschrift in einen
Montage- oder Bautagesbericht übernommen werden. Jede Datei bleibt ein zentrales
Dokument; die Berichtsausgabe ergänzt je Foto eine sauber umbrochene Bildseite.

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

Das Büro besitzt zusätzlich eine zentrale Berichtszentrale mit Suche,
Sortierung, Status-, Typ-, Baustellen-, Mitarbeiter- und Datumsfiltern. Fehlende
Pflichtberichte, offene Unterschriften, zurückgegebene und abgeschlossene
Berichte sind sofort erkennbar. Vor der Unterschrift steht eine klar markierte
PDF-Vorschau bereit. Ein eingereichter Bericht kann mit Pflichtkommentar an den
ursprünglichen Verfasser zurückgegeben und von ihm ohne zweite Berichtsnummer
erneut eingereicht werden. Jeder Statuswechsel bleibt unveränderlich
protokolliert.

Digitale und diktierte Büroberichte werden während der Eingabe lokal und
benutzerbezogen als Entwurf gesichert. Material, Geräte, Behinderungen, offene
Punkte, Absprachen, Witterung und Vorfälle bleiben getrennte fachliche
Abschnitte.

## Dokumentfreigabe und Offline-Ansicht

Jedes aktive Dokument besitzt eine eigene mobile Freigabe. Mobile Rollen sehen
nur ausdrücklich freigegebene Dokumente der berechtigten Baustelle. Zusätzlich
kann das Büro wichtige Pläne als offline prioritär markieren. Die PWA lädt
diese Inhalte benutzerbezogen in einen getrennten Cache; die Serverberechtigung
bleibt für jeden normalen Abruf bestehen. Der Service Worker liest nur den zur
angemeldeten Benutzer-ID passenden Dokumentcache. Beim Kontowechsel werden
fremde Dokumentcaches, beim Abmelden alle Dokumentcaches entfernt. Ein Dokument
darf nur offline priorisiert sein, wenn es zugleich mobil freigegeben ist.

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
