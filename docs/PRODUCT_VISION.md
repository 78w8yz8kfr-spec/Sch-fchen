# Produktvision Schäfchen

Stand: 18.07.2026

## Zweck

Schäfchen ist eine modulare All-in-One-Unternehmenssoftware für
Handwerksbetriebe. Die Software bildet den Arbeitsablauf vom Büro bis zur
Baustelle in einem gemeinsamen Datenbestand ab. VDE ist ein optionales
Spezialmodul und nicht der Mittelpunkt des Produkts.

## Verbindliche Grundsätze

- Informationen werden einmal erfasst und in allen berechtigten Modulen
  verwendet.
- Fachobjekte werden referenziert; Kopien desselben Dokuments oder Datensatzes
  werden vermieden.
- Monteure erhalten eine besonders einfache, auf den nächsten Arbeitsschritt
  beschränkte Oberfläche.
- Büro, Projektleitung und Geschäftsführung erhalten Planung, Verwaltung und
  Auswertung entsprechend ihrer Rolle.
- Module können je Betrieb schrittweise aktiviert werden, ohne Datenbestand
  oder System zu wechseln.
- Alle Daten bleiben strikt einer Firma zugeordnet und werden serverseitig
  geschützt.

## Fachliche Hierarchie

`Firma → Kunde → Projekt → Baustelle → Dokumente / Aufgaben / Berichte / Zeiten / Material / Fotos`

Eine Baustelle gehört immer genau zu einem Projekt. Projekt und Baustelle sind
die verbindlichen Anker für die späteren Fachmodule.

## Sichtbare Standardrollen

| Rolle | Schwerpunkt |
| --- | --- |
| Geschäftsführer | Betriebliche Gesamtsteuerung |
| Administrator | Technische Administration und Vollzugriff |
| Büro / Disposition | Kunden-, Baustellen- und Einsatzplanung |
| Projektleiter | Zugewiesene Projekte und Baustellen |
| Vorarbeiter | Erweiterte Arbeit auf zugewiesenen Baustellen |
| Monteur | Eigener Live-Arbeitstag und zugewiesene Baustelle |

Frühere Rollenschlüssel bleiben intern kompatibel, werden aber bei neuen
Mitarbeitern nicht mehr angeboten.

## Oberflächen

Das Mitarbeiter-Dashboard enthält ausschließlich Live-Informationen:
aktueller Status, aktuelle Baustelle, Beginn des Status, Arbeitszeit und
Vorarbeiterstatus. Wochenansicht und Verwaltung sind getrennte Ansichten.

Das Baustellen-Dashboard verwendet aufklappbare Themenbereiche für Mitarbeiter,
Berichte, Dokumente, Fotos, Aufgaben, Material, Notizen und weitere Module. Es
gibt bewusst keine unübersichtliche Gesamtchronik.

## Dokumente und Firmenauftritt

Ein Dokument wird einmal gespeichert und kann gleichzeitig mit Kunde, Projekt,
Baustelle, Bericht und Dokumentenverwaltung verknüpft sein. Neue Dokumentmodule
müssen dieses Referenzprinzip einhalten.

Das Logo der jeweiligen Firma erscheint im Firmenkontext, in späteren PDFs,
Berichten, Dokumenten, Druckansichten und E-Mails. Das Schäfchen-Logo bleibt die
Marke der Software. Solange kein Firmenlogo hinterlegt ist, wird ein neutraler
Firmeninitial als Platzhalter verwendet. Die Beschriftung „Firma“ bleibt.

## Login

Normale Benutzer melden sich nur mit Personalnummer und Passwort an. Die
Firmennummer wird bei der Einrichtung serverseitig festgelegt und im normalen
Login nicht angezeigt. Ein Startpasswort muss bei der ersten Anmeldung ersetzt
werden.

## Modulausbau

Vorgesehen sind Kunden, Projekte, Baustellen, Zeiten, Wochenplanung,
Mitarbeiter, Dokumente, Aufgaben, Material, Lager, Fahrzeuge, CRM, Rechnungen,
Wartung sowie die Spezialmodule VDE, LWL, DGUV und KNX. Neue Module verwenden
den gemeinsamen Kern und führen keine parallelen Stammdaten ein.
