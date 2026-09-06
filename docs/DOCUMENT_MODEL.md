# Zentrales Dokumentenmodell

Stand: 26.07.2026
Technischer Stand: V0.23.0

## Grundsatz

Eine Datei wird pro Firma genau einmal gespeichert. Die Tabelle `documents`
enthält Metadaten und den fachlichen Status, `document_contents` genau einen
Dateiinhalt und `document_links` beliebig viele Verknüpfungen zu Kunde, Projekt
oder Baustelle. Dadurch kann derselbe Montageplan an allen drei Stellen
erscheinen, ohne drei Dateikopien zu erzeugen.

Wird beim Upload eine Baustelle ausgewählt, ermittelt die API das zugehörige
Projekt und den Kunden serverseitig und legt alle drei Verknüpfungen an. Bei
identischem SHA-256-Inhalt wird das vorhandene Dokument wiederverwendet und nur
die fehlende Verknüpfung ergänzt.

Freigegebene Montage- und Bautagesberichte erzeugen genau eine unveränderliche
PDF-Datei. Sie enthält historische Firmen- und Auftragsdaten sowie beide
Unterschriften und wird über dieselben Verknüpfungen bei Kunde, Projekt,
Baustelle und Dokumentenverwaltung sichtbar.

## Erster Online-Stand

- unterstützte Formate: PDF, JPEG, PNG, WebP, Text, XLSX und DOCX
- der gemeldete Dateityp wird gegen den tatsächlichen Inhalt geprüft
  (Signatur/„Magic Bytes"), nicht nur gegen Dateiendung und Client-Angabe;
  XLSX und DOCX teilen sich als ZIP-Archive dieselbe Signatur und werden
  bewusst nicht anhand des Archivinhalts weiter unterschieden
- Lieferscheine sind bewusst auf JPEG-, PNG- oder WebP-Fotos begrenzt
- maximale Dateigröße: 5 MB
- Dateinamen werden vor dem Speichern auf NFC vereinheitlicht (macOS liefert
  Umlaute beim Hochladen oft in zerlegter Form) und dürfen kein doppeltes
  Anführungszeichen enthalten, da der Name ungeschützt in den
  `Content-Disposition`-Kopf einfließt
- Download ausschließlich nach gültiger Sitzung und Verwaltungsrollenprüfung
  oder nach tagesgenau geprüfter Baustellenzuweisung
- Download immer als Anlage mit `nosniff` und ohne Browser-Cache
- Archivierung statt Hartlöschen; Datei und Beziehungen bleiben erhalten
- optimistische Versionsprüfung über `row_version`
- Row Level Security auf Metadaten, Inhalt und Verknüpfungen

Der Dateiinhalt liegt vorübergehend größenbegrenzt in PostgreSQL. Die Trennung
von Metadaten und Inhalt ist bereits so angelegt, dass `document_contents`
später durch einen S3-kompatiblen Objektspeicher ersetzt werden kann, ohne das
fachliche Dokument oder seine Verknüpfungen zu ändern. Vor echten größeren
Dateimengen ist dieser Umzug zusammen mit Backup- und Aufbewahrungsregeln
verpflichtend.

## Oberfläche

Der Dokumentenbereich ist Teil der Baustellenverwaltung und kein zusätzlicher
Hauptmenüpunkt. Kunden- und Projektlisten zeigen ihre Dokumentanzahl und führen
direkt zur passenden gefilterten Dokumentliste. Im Baustellen-Dashboard werden
die verknüpften Dokumente im vorhandenen Themenbereich angezeigt und können von
dort geöffnet oder ergänzt werden. „Lieferschein fotografieren“ öffnet auf
Mobilgeräten direkt die Kamera und verknüpft das gespeicherte Original
automatisch mit der geöffneten Baustelle sowie deren Projekt und Kunde.
Der mobile Bereich **Fotos** verwendet dasselbe Prinzip: Aufnahmen von
zugewiesenen Monteuren und Vorarbeitern werden als Kategorie `photo` zentral
gespeichert und nur als eigene thematische Liste dargestellt.
