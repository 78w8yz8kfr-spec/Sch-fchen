# Optionale Elektro-Spezialmodule

Stand: 29.07.2026
Technischer Stand: V0.39.0

## Ziel

VDE und DGUV werden als optionale Fachmodule an denselben Firmen-,
Kunden-, Projekt-, Baustellen-, Mitarbeiter- und Dokumentenbestand angebunden.
Ein Modul erzeugt keine parallelen Stammdaten.

## Freigabeprinzip

- Ein fehlender Freigabedatensatz bedeutet sicher „deaktiviert“.
- Nur Administrator und Geschäftsführung dürfen Module firmenweit aktivieren
  oder deaktivieren.
- Jede Statusänderung erhöht den Versionsstand und wird mit Benutzer und
  Zeitpunkt unveränderlich historisiert.
- Mandantenfilter werden serverseitig erzwungen.
- Deaktivierung entfernt keine Fachdaten.

## Sichtbarkeit

Ein Modul erscheint erst dann in der Baustellenakte, wenn seine echte
Fachfunktion vollständig angebunden und für die jeweilige Firma aktiviert ist.
Es werden keine leeren Menüpunkte oder funktionslosen Platzhalter angezeigt.

VDE ist seit V0.39.0 vollständig angebunden. Administration oder
Geschäftsführung schalten es unter „Elektro-Spezialmodule“ firmenweit ein.
Anschließend erscheint der Einstieg ausschließlich an einer konkreten
Baustelle. DGUV bleibt vorbereitet, aber bis zur eigenen Fachintegration
unsichtbar und nicht aktivierbar.

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
2. Der nächste Fachbaustein ist DGUV nach demselben Aktivierungs-, Referenz-,
   Historisierungs- und Dokumentprinzip.
