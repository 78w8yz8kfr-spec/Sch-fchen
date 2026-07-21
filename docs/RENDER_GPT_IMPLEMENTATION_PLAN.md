# Umsetzungsplan aus „Render für Web-App Hosting“

Stand: 21.07.2026

Dieses Dokument ordnet die im früheren Projekt-GPT ausgearbeiteten
Produktentscheidungen und übersetzt sie in eine ausführbare Reihenfolge. Bei
Widersprüchen gilt die jeweils jüngere, konkretere Entscheidung.

## Verbindliche Produktgrenze

- Schäfchen wird zunächst für Elektrobetriebe gebaut.
- Der gemeinsame Firmen-, Kunden-, Projekt-, Baustellen- und Dokumentenkern
  kann später für andere Gewerke verwendet werden.
- Diese spätere Erweiterbarkeit darf den aktuellen Elektro-Arbeitsablauf nicht
  verwässern oder unnötig kompliziert machen.
- VDE, DGUV, LWL und KNX sind optionale Module auf dem gemeinsamen Kern.
- Die bestehende VDE-Anwendung bleibt fachliche Quelle, bis ihre Funktionen
  kontrolliert in das Baustellenmodul übernommen werden.

## Verbindliche Bedienlogik

### Monteur

- sieht nur den nächsten sinnvollen Arbeitsschritt;
- bucht Arbeitsbeginn, Baustellenankunft, Baustellenabfahrt, nächste Baustelle
  und Feierabend;
- kann mehrere Baustellen pro Tag und dieselbe Baustelle erneut anfahren;
- sieht nur eigene Zeiten, zugewiesene Baustellen und freigegebene Dokumente;
- arbeitet offline weiter, bis die Verbindung wieder verfügbar ist.

### Büro und Projektleitung

- planen Mitarbeiter und Baustellen manuell oder über Excel an derselben
  fachlichen Stelle;
- verwalten Firma, Kunden, Projekte, Baustellen, Dokumente und spätere
  Fachmodule entlang einer gemeinsamen Hierarchie;
- erhalten vollständige Historie statt hart gelöschter Datensätze;
- korrigieren und genehmigen nach rollenbasierten Regeln.

## Daten- und Dokumentenprinzip

`Firma → Kunde → Projekt → Baustelle → Fachmodule`

Ein Dokument und sein Dateiinhalt werden einmal gespeichert. Verknüpfungen
machen dasselbe Original in Kunde, Projekt, Baustelle, Bericht und zentraler
Dokumentenverwaltung sichtbar. Fotos, Lieferscheine und später erzeugte PDFs
dürfen keine parallelen Stammdatenbestände erzeugen.

## Abgeglichener Entwicklungsstand

### Vorhanden

- sicherer Online-Login und Passwortwechsel;
- Rollen und serverseitige Mandantentrennung;
- Offline-Zeitereignisse und Live-Stundenzettel;
- manuelle Einsatzplanung und Excel-Wochenplan;
- Kunden-, Projekt- und Baustellenverwaltung;
- Excel-Baustellenimport;
- zentrale, mehrfach verknüpfbare Dokumente;
- Firmenlogo getrennt von der Schäfchen-Softwaremarke.

### Aktueller Ausbauschritt

- Lieferschein direkt in der geöffneten Baustelle fotografieren;
- Bild einmal zentral speichern und automatisch mit Baustelle, Projekt und
  Kunde verknüpfen;
- JPG, PNG und WebP bis 5 MB; kein paralleler Lieferschein-Datensatz.

## Geordnete nächste Schritte

1. **Betriebssicherheit**
   Dauerhafte Render-Datenbank, Backups, Wiederherstellung, Überwachung und
   Aufbewahrung festlegen. Für wachsende Dateimengen wird S3-/MinIO-kompatibler
   Objektspeicher angebunden.
2. **Baustellenarbeit**
   Aufgaben, Material, Notizen sowie Montage- und Bautagesberichte direkt in
   der Baustelle ergänzen. Keine globale Aktivitätschronik.
3. **Berichte und PDFs**
   Entwurf, Freigabe, Unterschriften, unveränderliche PDF-Version und zentrale
   Dokumentverknüpfung. Firmenlogo und zum Erstellzeitpunkt gültige Firmendaten
   werden historisch korrekt verwendet.
4. **Berechtigte mobile Erfassung**
   Vorarbeiter und Monteure dürfen Fotos und Berichte nur für zugewiesene
   Baustellen und im freigegebenen Umfang erfassen. Das Backend prüft Firma,
   Rolle, Zuweisung und Datum.
5. **Elektro-Spezialmodule**
   VDE, DGUV, LWL und KNX werden einzeln aktivierbar und verwenden dieselben
   Kunden, Projekte, Baustellen, Dokumente und Mitarbeiter.
6. **Ausbildungsnachweise**
   Wochenberichte, Berufsschule, Urlaub/Krankheit, Erinnerungen, Unterschriften,
   Sammelfreigabe, Rückgabe und unveränderliche Historie.
7. **Assistenzfunktionen**
   Foto-Digitalisierung, OCR, Spracheingabe und Vorschläge. KI darf Vorschläge
   liefern, aber keine fachliche Freigabe oder Unterschrift ersetzen.

## Bewusst später

- Angebote, Rechnungen, CRM, Lager und Fahrzeuge;
- Branchenpakete außerhalb Elektro;
- Preis- und Lizenzmodelle;
- KI-Automatisierung vor stabilen Fachprozessen.

## Abnahmeregel je Ausbauschritt

Ein Schritt gilt erst als abgeschlossen, wenn Oberfläche, API-Berechtigung,
Mandantentrennung, Historie, Tests, Dokumentation und Produktions-Upgradepfad
gemeinsam geprüft sind. Neue Hauptnavigation entsteht nur für regelmäßig
genutzte Arbeitsbereiche; Importfunktionen bleiben in der jeweiligen Planung.
