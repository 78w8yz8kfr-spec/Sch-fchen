# Optionale Elektro-Spezialmodule

Stand: 01.08.2026
Technischer Stand: V0.42.0

## Ziel

VDE und DGUV werden als optionale Fachmodule an denselben Firmen-,
Kunden-, Projekt-, Baustellen-, Mitarbeiter- und Dokumentenbestand angebunden.
Ein Modul erzeugt keine parallelen Stammdaten.

## Freigabeprinzip

- Ein fehlender Freigabedatensatz bedeutet sicher „deaktiviert“.
- Nur eine berechtigte Plattformrolle darf Module für eine Firma aktivieren
  oder deaktivieren; Firmenrollen können eine Freigabe lediglich anfragen.
- Jede Statusänderung erhöht den Versionsstand und wird mit Plattformkonto und
  Zeitpunkt unveränderlich historisiert.
- Mandantenfilter werden serverseitig erzwungen.
- Deaktivierung entfernt keine Fachdaten.

## Sichtbarkeit

Ein Modul erscheint erst dann in der Baustellenakte, wenn seine echte
Fachfunktion vollständig angebunden und für die jeweilige Firma aktiviert ist.
Es werden keine leeren Menüpunkte oder funktionslosen Platzhalter angezeigt.

VDE ist seit V0.39.0 vollständig angebunden. Eine berechtigte Plattformrolle
schaltet es in der Firmendetailseite mit Gültigkeit, Tarifbezug, Limits und
Funktionsumfang frei. Anschließend erscheint der Einstieg ausschließlich an
einer konkreten Baustelle. DGUV bleibt vorbereitet, aber bis zur eigenen
Fachintegration unsichtbar und nicht durch Firmenkonten aktivierbar.

## VDE-Anbindung

- Kunde, Projekt, Baustelle, Prüfer, Firma und Firmenlogo stammen aus dem
  gemeinsamen Schäfchen-Bestand.
- Gespeichert werden ausschließlich strukturierte VDE-Fachdaten und Referenzen
  auf diesen Bestand.
- Entwürfe sind versionsgeschützt; jeder Serverstand wird vollständig
  historisiert.
- Der Abschluss erzeugt genau eine unveränderliche PDF der Kategorie
  `inspection` in der zentralen Baustellenakte.
- Ein deaktiviertes Modul verschwindet aus der Fachoberfläche. Vorhandene
  Prüfungen, Historien und Dokumente bleiben erhalten.
- V15-Bestände können kontrolliert importiert werden; ein mitgeliefertes
  Original-PDF bleibt unverändert erhalten.

Die vollständigen Fach- und Berechtigungsregeln stehen in
[`VDE_MODULE.md`](VDE_MODULE.md).

## Reihenfolge

1. VDE ist kontrolliert mit dem gemeinsamen Bestand verbunden.
2. Zuerst folgen die im Fahrplan vorgesehenen VDE-Abnahmen, Pilotierung und
   V1.0-Freigabe.
3. DGUV beginnt ausdrücklich erst nach V1.0 und folgt dann demselben
   Aktivierungs-, Referenz-, Historisierungs- und Dokumentprinzip.
