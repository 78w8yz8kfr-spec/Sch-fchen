# Baustellenarbeit: Aufgaben, Material und Berichte

Stand: 21.07.2026
Technischer Stand: V0.19.0

## Bedienkonzept

Die Baustelle bleibt der Arbeitsort. Aufgaben, Material und Berichte erscheinen
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

## Aufgaben

`site_tasks` speichert Aufgabe, Beschreibung, Priorität, optionalen Mitarbeiter,
Fälligkeit und Status. Die Statusfolge lautet `open`, `in_progress`, `done` und
optional `archived`. Beim Abschluss setzt PostgreSQL den Abschlusszeitpunkt.
Änderungen verwenden `row_version`; hartes Löschen ist gesperrt.

## Material

`site_material_entries` bildet die einfache Baustellenlogistik ab. Ein Eintrag
enthält Bezeichnung, Menge, Einheit, Hinweis und den Stand `planned`, `ordered`,
`available`, `used` oder `archived`. Die mobile Oberfläche führt schrittweise
von „Benötigt“ über „Bestellt“ und „Vor Ort“ bis „Verbraucht“.

## Montage- und Bautagesberichte

`site_reports` speichert Montage- oder Bautagesbericht, Arbeitstag, Titel,
Inhalt, Autor, Status und Erfassungsart. Drei gleichwertige Einstiege sind
vorgesehen:

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
- Nur Planungsrollen dürfen die aktuellen Verwaltungsendpunkte verwenden.
- Baustellen und zugewiesene Mitarbeiter müssen aktiv und im selben Mandanten
  vorhanden sein.
- Fremde Dokumente oder Dokumente einer anderen Baustelle werden abgewiesen.
- RLS, zusammengesetzte Fremdschlüssel, Versionsprüfung und Löschschutz gelten
  für alle drei Module.

## Nächster Ausbau

Als nächstes erhalten Berichte Entwurf, Freigabe, Unterschrift und eine
unveränderliche PDF-Version mit dem zum Erstellzeitpunkt gültigen Firmenlogo und
den historischen Firmendaten. Danach werden klar begrenzte mobile Rechte für
Vorarbeiter und Monteure ergänzt.
