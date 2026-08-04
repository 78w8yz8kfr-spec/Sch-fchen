# Changelog

Alle wesentlichen Änderungen an Schäfchen werden in dieser Datei dokumentiert.

## [Unreleased]

- die Bereiche der App lassen sich firmenweit abschalten: Montageberichte,
  Bautagesberichte, Dokumentenverwaltung, Materialverwaltung, Abwesenheiten,
  Baustellenlink und QR sowie VDE-Prüfprotokolle. Ein abgeschalteter Bereich
  verschwindet aus der Oberfläche und wird auch über die Schnittstelle
  abgewiesen; vorhandene Daten bleiben erhalten und sind nach dem
  Wiedereinschalten unverändert da. Jede Umstellung steht mit Zeitpunkt und
  handelnder Person in der Historie.
- die abschaltbaren Bereiche kommen aus `module_catalog`, dem Katalog der
  Plattformverwaltung. Er ist die einzige Quelle: `category = 'core'` markiert
  den unverzichtbaren Kern, `is_special` das, was die Plattform zuerst
  freigeben muss. Wer dort ein Modul ergänzt, muss nichts weiter nachziehen.
  Abwesenheiten und Baustellenlink fehlten im Katalog und sind ergänzt.
- Fehler behoben: der Schalter für Module war ohne Wirkung. Die Verwaltung zeigte
  ihn bedienbar, doch jeder Versuch endete mit „Spezialmodule werden
  ausschließlich durch die Plattformverwaltung freigeschaltet“. Die zugehörige
  Funktion war ein Platzhalter, der ausnahmslos abwies. Die beiden Ebenen sind
  jetzt getrennt: die Plattform gibt ein Spezialmodul frei, die Firma schaltet
  es zusätzlich ein oder aus.
- die Zeiterfassung ist im Katalog als Kern gekennzeichnet und damit nicht
  abschaltbar; ohne sie ist Schäfchen kein Arbeitszeitnachweis mehr. Die
  Einsatzplanung bleibt ebenfalls fest, weil die Zeiterfassung an der
  Baustellenzuordnung hängt. Bereiche, die noch nicht gebaut sind, erscheinen
  gar nicht erst als Schalter.
- der Schalter für DGUV ist entfernt. Das Modul war nicht gebaut, ließ sich aber
  in der Verwaltung anwählen.

- Fehler behoben (Datenverlust): offline erfasste Buchungen und Berichte gingen
  beim Tageswechsel verloren. Der gespeicherte Stand wurde nur wiederhergestellt,
  wenn er vom selben Kalendertag stammte; wer abends ohne Verbindung buchte und
  die App am nächsten Morgen öffnete, verlor die Arbeit des Vortags
  stillschweigend, und der nächste Speichervorgang überschrieb sie endgültig.
  Der Arbeitstag beginnt jetzt neu, nimmt aber alles mit, was noch nicht beim
  Server ist. Der Mitarbeiter wird darauf hingewiesen. Die Kennung des
  Mitarbeiters wird dabei zwingend mitgeführt, damit übernommene Arbeit nicht
  einem anderen Konto zugeordnet werden kann.
- der Zustandsspeicher liegt in `frontend/core/state-store.js` und ist ohne
  Browser prüfbar.

- Fehler behoben: Administration, Geschäftsführung und Projektleitung ließen
  sich weiterhin nicht einplanen, obwohl die Schnittstelle sie längst zulässt.
  Die Plantafel, die Einzelzuweisung und die Teamvorlagen zeigten nur Monteure
  und Vorarbeiter, sodass die übrigen Rollen gar nicht erst zur Auswahl standen.
  Jeder aktive Mitarbeiter steht jetzt in allen drei Listen. Die Tageslage zählt
  dieselbe Menge.
- auf der Plantafel stand hinter jedem Namen entweder „Vorarbeiter“ oder
  „Monteur“; eine Geschäftsführerin erschien damit als Monteurin. Die
  Bezeichnung stammt jetzt überall aus derselben Stelle und lautet für
  planende Rollen „Planung“.
- die Rollenlogik der Oberfläche liegt in `frontend/core/permissions.js` und
  ist ohne Browser prüfbar. Die Liste der Planungsrollen stand vorher zweimal
  fast gleich in `app.js`; die Fassung für die eingeschränkte Projektsicht
  leitet sich nun aus der vollen Liste ab und kann nicht mehr abweichen.

- Fehler behoben: ein offline geschriebener Bericht ging verloren, wenn die
  Sitzung während der Übertragung ablief. Der Bericht wurde dauerhaft als
  fehlerhaft vermerkt und nach dem erneuten Anmelden nie wieder versucht. Bei
  Zeitbuchungen war derselbe Fall bereits richtig behandelt. Eine abgelaufene
  Sitzung, ein Ausfall des Servers und eine fehlende Verbindung führen jetzt
  einheitlich zu einem neuen Versuch; nur eine inhaltliche Zurückweisung des
  Servers hält den Datensatz an, weil dann ein Mensch hinsehen muss.
- die Regeln der Offline-Warteschlange liegen in `frontend/core/sync-queue.js`
  und sind ohne Browser prüfbar. Welcher Fehler wie behandelt wird, stand
  vorher zweimal in `app.js` und wich zwischen Berichten und Zeitbuchungen
  voneinander ab.

- Fehler behoben: die Anpassung der Wochenansicht an schmale Geräte blieb
  wirkungslos. Die Medienabfrage traf zu, wurde aber von einer weiter unten
  stehenden Regel gleicher Spezifität wieder aufgehoben; der Kopfbereich stand
  auf dem Handy deshalb rechtsbündig. Ein Test prüft jetzt alle Stylesheets auf
  solche überschriebenen Anpassungen.
- der Wochenwechsel sieht aus wie dieselbe Bedienung auf der Plantafel und ist
  mit dem Finger sicher zu treffen: vorher 30 Pixel groß und grau, jetzt 40
  Pixel und farbig. Die Felder des Stundenexports waren ohne eigene Gestaltung
  nur rund 22 Pixel hoch und folgen jetzt den Maßen der übrigen Auswahlfelder;
  gleiches gilt für „Gelesen“ an den Mitteilungen.
- die Plantafel heißt auf jedem Gerät „Plantafel“. Die Überschrift lautete
  „Desktop-Plantafel“, auch wenn sie auf dem Handy geöffnet wurde.

- die Büroverwaltung liegt vollständig im Bereich „Mehr“ und nicht mehr hinter
  einem Aufklapper in der Wochenansicht. Jahreskonten, Feiertagskalender und
  die Regel für eigene Zeitkorrekturen stehen dort gleichrangig nebeneinander;
  der Feiertagskalender war zuvor in der Karte der Jahreskonten versteckt. Die
  Wochenansicht zeigt nur noch das eigene Stundenkonto.
- die Auswertung der Verwaltung folgt einer eigenen Jahresauswahl statt der in
  der Wochenansicht gewählten Woche. Das Jahr galt bisher für Jahreskonten und
  Feiertage gleichermaßen, ließ sich aber nur über einen Wochenwechsel
  verstellen.

- die Regel für eigene Zeitkorrekturen lässt sich jetzt in der Verwaltung
  auswählen: drei erklärte Möglichkeiten, Begründungsfeld und sofort sichtbarer
  Stand. Lesen darf die Planung, ändern nur Administration und
  Geschäftsführung; die Oberfläche bildet das ab, statt eine Schaltfläche zu
  zeigen, die der Server anschließend verweigert.

- Fehler behoben: Zeitbuchungen auf einer Baustelle, für die der Mitarbeiter
  nicht eingeplant war, wurden abgewiesen. Live durfte er die Baustelle
  längst selbst wählen; beim Nachtragen und beim Berichtigen fehlte diese
  Möglichkeit, und für zurückliegende Tage ließ sich die Baustelle überhaupt
  nicht mehr wählen. Der fehlende Einsatz wird jetzt überall gleich behandelt
  und als Auswahl des Mitarbeiters angelegt. Die Planung erkennt am Grund
  „Spontane Auswahl durch den Mitarbeiter“, dass er nicht von ihr stammt.
- Fehler behoben: Administration, Geschäftsführung und Projektleitung ließen
  sich nicht auf Baustellen einplanen; Einsätze waren auf Monteure und
  Vorarbeiter beschränkt. In kleinen Betrieben arbeiten sie regelmäßig mit.
  Jeder aktive Mitarbeiter kann jetzt eingeplant und in eine Teamvorlage
  aufgenommen werden. Die Berichtsverantwortung bleibt dem Vorarbeiter
  vorbehalten.
- die Firma wählt, wie mit eigenen Zeitkorrekturen vor der Freigabe des
  Arbeitstags umgegangen wird: `review_required` macht jede Änderung und
  Löschung zum prüfpflichtigen Antrag, `same_day` lässt den laufenden
  Kalendertag frei und verlangt für zurückliegende Tage eine Prüfung,
  `immediate` entspricht dem bisherigen Verhalten
- **Verhaltensänderung:** Voreinstellung ist `review_required`, auch für
  bestehende Firmen. Bisher wurde jede eigene Korrektur an einem noch nicht
  freigegebenen Arbeitstag sofort wirksam, ohne dass das Büro davon erfuhr.
  Wer das beibehalten will, stellt die Regel auf `immediate`.
- die Regel ändert nur die Selbstkorrektur. Die Bearbeitung fremder Zeiten
  durch das Büro folgt weiterhin allein dem Status des Arbeitstags. Lesen darf
  die Regel die Planung, ändern nur Administration und Geschäftsführung.
- Fehler behoben: Eine Zeitkorrektur, die ohne Beteiligung des Büros sofort
  wirksam wurde, trug den Mitarbeiter selbst als Prüfer ein. Das Protokoll
  behauptete damit eine Freigabe, die es nie gegeben hat. Migration 045 führt
  diesen Fall als eigenen Zustand: wirksam, ausdrücklich ungeprüft und ohne
  Prüfer. Bereits gespeicherte Einträge bleiben unverändert, weil eine
  nachträgliche Umschrift selbst eine Verfälschung der Historie wäre.
- der Service Worker wird im Betrieb geprüft statt im Quelltext: zehn Tests
  fahren die Ereignisbehandlungen aus und belegen unter anderem, dass offline
  ausschließlich der Dokumentencache des eigenen Kontos gelesen wird und dass
  Offline-Dokumente ein App-Update überstehen
- die Zeitberechnung des Stundenzettels liegt jetzt in `frontend/core/work-time.js`
  und wird von der App importiert; damit ist die Rechnung unabhängig von der
  Oberfläche prüfbar. `frontend/index.html` lädt `app.js` als Modul, der
  Service Worker legt den Kern mit in der App-Shell ab
- die Mindestpause bleibt unverändert bei 30 Minuten ab 3,5 Stunden und
  60 Minuten ab 6 Stunden Bruttozeit; sie ist jetzt an sieben Beispielen
  festgeschrieben, ebenso die Deckelung der Fahrzeit auf die Arbeitszeit
- Fehler behoben: Eine Vertragszuweisung (`POST /api/v1/platform/companies/:id/contracts`)
  schlug immer mit einem unbehandelten Serverfehler fehl, sobald kein
  Vertragsende übermittelt wurde. Ursache war ein einzelner Datenbankparameter,
  der gleichzeitig für die Spalte `license_valid_until` (DATUM) und
  `contract_ends_at` (ZEITSTEMPEL) verwendet wurde; PostgreSQL konnte dafür
  keinen eindeutigen Typ ableiten. Der Endpunkt war zuvor vollständig ungetestet
  und der Fehler entsprechend unbemerkt geblieben.
- die Plattformverwaltung ist im PostgreSQL-Integrationstest jetzt breit
  abgedeckt: Firmenanlage und kritische Statusänderung, Modulfreigabe,
  Tarif- und Vertragszuweisung, Plattformadministratoren mit Rollenrechten
  und Selbstschutz, Firmenkonten mit Kontoaktionen einschließlich
  Firmenwechsel, Registrierungsfreigabe und -ablehnung, Supportfälle,
  Systemstatus, gruppierte Plattformfehler, Versionsentwürfe, Mitteilungen
  mit Empfängerprüfung, Backup-Anstoß, sowie eine vollständige
  Datenschutzanfrage über alle Phasen mit Zwei-Personen-Freigabe
- die GitHub-Prüfung misst die Testabdeckung von `api/src` und bricht ab, wenn
  sie 81 Prozent Zeilen, 71 Prozent Zweige oder 91 Prozent Funktionen
  unterschreitet; `make api-coverage` führt dieselbe Prüfung lokal aus
- die Schwelle fängt vor allem den Fall ab, dass die PostgreSQL-Integrationstests
  unbemerkt nicht mehr laufen: die Abdeckung fällt dann von 81,80 auf 26,78
  Prozent und die Prüfung schlägt fehl
- der PostgreSQL-Integrationstest ist in zwölf benannte Abschnitte von der
  Ersteinrichtung bis zum Sitzungsende aufgeteilt; bisher war er eine einzige
  Prüfung über rund 4.000 Zeilen, bei der ein Fehler in der Mitte alles
  Nachfolgende stillschweigend ausfallen ließ, ohne dass das Ergebnis es zeigte
- ein Fehler wird jetzt dem verursachenden Abschnitt zugeordnet und die
  übrigen Abschnitte laufen weiter; die Abschnitte teilen sich weiterhin
  bewusst ihren Datenbestand, weil ein Stundenzettel den Einsatz und der
  Einsatz die Baustelle voraussetzt
- die Zeitbearbeitung aus V0.42 ist automatisiert abgedeckt: die
  Ungültigkeitserklärung einer eigenen Buchung, die Bearbeitung und Löschung
  fremder Buchungen durch das Büro sowie der Stundenzettelabruf des Büros
  werden gegen PostgreSQL geprüft, einschließlich unbekannter Buchung,
  wartender Zweitänderung, veraltetem Zeitstand, fehlender Planungsberechtigung
  und nicht zugeordneter Baustelle
- die Prüfungen für `validateTimeEntryEdit`, `validateTimeEntryDelete` und
  `validateId` sind ergänzt; `validateId` sichert 45 Pfadparameter der API ab
  und war bisher nicht direkt geprüft
- die SQL-Abnahmetests der Migrationen 005, 006, 007, 042 und 043 prüfen den
  Mandantenschutz jetzt unter der eingeschränkten Datenbankrolle
  `schaefchen_api`; da alle Tabellen `NO FORCE ROW LEVEL SECURITY` verwenden,
  blieben die Mandanten-Policies bisher wirkungslos, solange die Tests als
  Eigentümer liefen
- die SQL-Abnahmetests der Migrationen 039, 040 und 041 belegen die Trennung
  zwischen Firmen- und Plattformrolle am Verhalten: die Firmenrolle erreicht
  weder Plattformkonten noch Tarif-, Vertrags- und Betriebstabellen, während
  die Plattformrolle firmenübergreifend arbeitet
- der SQL-Abnahmetest der Migration 044 prüft die Empfängerbegrenzung
  systemweiter Mitteilungen am tatsächlichen Leseergebnis statt am Text der
  Policy; eine an eine fremde Firma gerichtete oder unveröffentlichte
  Mitteilung darf die Firmenrolle nicht erreichen

## [0.42.0] – Plattformverwaltung, sichere Zeitkorrekturen und ruhige Woche

- der Systemadministrator ist als eigenes Plattformkonto mit eigener Sitzung,
  Datenbankrolle, Anmeldung und Navigation vollständig von Firmenbenutzern und
  Mitarbeitern getrennt; er erhält keine Firma, Betriebsrolle, Einsatz- oder
  Zeitdaten
- eine rollenbasierte Plattformverwaltung bündelt Übersicht, Firmen, Konten,
  Tarife, Module, Registrierungen, Support, Systemstatus, gruppierte Fehler,
  Versionen, Mitteilungen, Backups, Datenschutz, Audit und globale
  Einstellungen; Superadministration, Support, Technik, Vertrieb, Buchhaltung
  und Datenschutz besitzen getrennte, granular änderbare Rechte
- Firmenliste und Firmendetail unterstützen Suche, Statusfilter, Sortierung,
  Pagination, Verträge, Limits und ausschließlich plattformseitig steuerbare
  Modulfreigaben; Vertragsstände und Tarifpreise bleiben als unveränderliche
  Versionen beziehungsweise Snapshots erhalten
- ein zeitlich begrenzter, begründungspflichtiger Supportmodus öffnet eine
  sichere Firmenkontextansicht ohne Mitgliedschaft; Banner, Ablauf, geöffnete
  Bereiche, Änderungen und Beendigung werden protokolliert
- Wiederherstellungen und endgültige Datenschutzmaßnahmen verwenden
  Zwei-Personen-Freigaben und explizite Bestätigungstexte; Plattform-Audit-
  Einträge sind unveränderlich, enthalten Vorher-/Nachher-Stand und werden vor
  unnötigen Geheimnissen geschützt
- Wartungsmodus und verpflichtende App-Versionen werden serverseitig
  durchgesetzt; veraltete Clients wechseln auf eine cachefreie
  Aktualisierungsseite, während die getrennte Plattformverwaltung erreichbar
  bleibt
- wirksame Zeiteinträge lassen sich bis zur Freigabe im Dialog an Baustelle,
  Arbeitsbeginn, Arbeitsende, Pause, Tätigkeit, Fahrtzeit und Arbeitstag
  berichtigen oder als vollständiger Arbeitsblock begründet löschen, ohne einen
  zweiten konkurrierenden Datensatz anzulegen
- jede Zeitänderung erzeugt unveränderliche Ersatzbuchungen, Auditstände und
  eine Neuberechnung nach Regelversion 4; Advisory Locks, Versionsprüfung,
  Idempotenz, Eindeutigkeit und Zeitachsenprüfung verhindern Dubletten,
  Überschneidungen und verlorene parallele Änderungen
- freigegebene oder abgerechnete Tage werden nicht still verändert, sondern
  durch einen berechtigten, protokollierten Korrekturantrag und eine getrennte
  Freigabe berichtigt
- Mitarbeiter ohne historische Abhängigkeiten können nach Bestätigung hart
  gelöscht werden; andernfalls werden Konto und künftige Planung atomar
  archiviert, Sitzungen widerrufen und historische Referenzen erhalten;
  archivierte Mitarbeiter besitzen eine eigene Ansicht und können reaktiviert
  werden
- die mobile Baustellenanlage verwendet einen tastaturfreundlichen,
  vollständig scrollbaren Dialog mit Safe-Area-Abständen, sichtbarer
  Speichern-Aktion, Fokus-Scroll und feldnahen Validierungsfehlern ohne
  Datenverlust
- die Wochenansicht zeigt Kalenderwoche, Wochenleistung, Soll, Differenz,
  Zeitkonto, nächsten Einsatz, relevante Arbeitstage und offene Aktionen in
  klarer Hierarchie; Details und die vollständige zukünftige Feiertagsliste
  bleiben bis zum Aufklappen verborgen
- Migrationen 039 bis 044, eigene SQL-Abnahmetests, erweiterte
  PostgreSQL-Integration, API-Unit-Tests und PWA-Smoke-Tests sichern
  Plattformgrenze, Mandantenschutz, Zeitkorrektur, Mitarbeiter-Lebenszyklus,
  Modulhoheit, Versionsdurchsetzung und unveränderliche Historien

## [0.41.0] – Fahrplan-Abgleich, Berichtszentrale und vollständige Baustellenakte

- zentrale Berichtszentrale mit Suche, Sortierung und Filtern nach Status, Art,
  Baustelle, Mitarbeiter und Zeitraum sowie sofort sichtbaren fehlenden
  Pflichtberichten
- Berichte können mit Pflichtkommentar zur Überarbeitung zurückgegeben,
  vom ursprünglichen Verfasser ohne Dublette erneut eingereicht, vor der
  Unterschrift als PDF geprüft und anschließend unveränderlich abgeschlossen
  werden; die vollständige Statushistorie bleibt erhalten
- digitale Büroberichte werden automatisch lokal zwischengespeichert; Team,
  Ist-Stunden, strukturierte Zusatzangaben und ausgewählte JPG-/PNG-Fotos mit
  Bildunterschriften fließen ohne doppelte Eingabe in die Abschluss-PDF ein
- mobile und Büro-Baustellenakte besitzen die verbindliche Reihenfolge Auftrag,
  Team, Aufgaben, Berichte, Fotos, Dokumente, Material, Notizen und aktivierte
  Prüfmodule; Rollenstandard und zuletzt verwendeter Bereich werden berücksichtigt
- Dokumente lassen sich einzeln mobil freigeben und als offline wichtig
  kennzeichnen; nur freigegebene Dokumente erscheinen mobil, wichtige Dateien
  werden benutzerbezogen zwischengespeichert und bei Kontowechsel oder Abmeldung
  sicher vom vorherigen Benutzer getrennt
- stabiler Baustellen-QR-Code und Direktlink öffnen nach Anmeldung ausschließlich
  die berechtigungsgeprüfte Baustellenakte
- Projektleiter werden Projekten eindeutig zugeordnet und erhalten serverseitig
  ausschließlich Kunden, Baustellen, Dokumente, Berichte, Prüfungen und Einsätze
  ihrer aktiven Projektverantwortung; firmenweite Personal-, Zeit-, Import-,
  Abwesenheits- und Teamverwaltung bleibt Büro, Geschäftsführung und Administration
  vorbehalten
- Desktop-Plantafel mit Mitarbeiterzeilen, Wochen- und Monatsansicht,
  Mitarbeiter-, Team-, Baustellen- und Projektleiterfiltern, sichtbaren
  Abwesenheits-, Überschneidungs- und Vorarbeiterkonflikten sowie klarer
  Kennzeichnung nicht eingeplanter Feldmitarbeiter
- Drag-and-drop übernimmt Mitarbeiter und Datum in die begründungspflichtige
  Änderungsmaske; Einsatzkopie, Mehrfachzuweisung und persistente Teamvorlagen
  erzeugen weiterhin einzelne, historisch nachvollziehbare Mitarbeitereinsätze
- Datenbankmigrationen 037 und 038, RLS, Löschschutz,
  Versionskonfliktprüfung, QR-/Foto-/Team-/Berichtshistorie sowie erweiterte
  SQL-, API-, PDF-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern den Stand
- die VDE-PDF wurde zusätzlich visuell gerendert: Messwerte beginnen auf Seite
  zwei, das Stromkreisverzeichnis auf einer eigenen Folgeseite
- Abnahmematrix und priorisierter Backlog trennen nachweislich automatisierte
  Punkte von noch ausstehenden Geräte-, Last-, Infrastruktur-, Rechts- und
  Pilotabnahmen; DGUV bleibt gemäß Fahrplan ausdrücklich nach V1.0
- die offenen Freigabesperren sind als öffentliche GitHub-Issues #11 bis #23
  mit Abschlussnachweis angelegt; ein idempotenter Workflow stellt die
  P0-P3-/Kategorie-Labels sowie die belegten Tags und Releases V0.35 bis V0.42
  bereit

## [0.40.0] – Klare Baustellenbereiche und VDE-PDF-Seiten

- die mobile Baustellenakte zeigt Übersicht, Aufgaben, Notizen, Berichte, Dokumente, Fotos, Material und das optional aktivierte VDE-Modul als einzeln wählbare Arbeitsbereiche statt als lange Folge gleichzeitig sichtbarer Karten
- das Büro-Baustellendashboard verwendet dieselbe Bereichsnavigation für Übersicht, Mitarbeiter, Berichte, Dokumente, Aufgaben, Notizen, Material und VDE
- Schnellaktionen für Bericht, Dokument und Aufgabe öffnen direkt den zugehörigen Baustellenbereich
- die VDE-Abschluss-PDF beginnt auf Seite zwei unmittelbar mit Verteilungen, Schutzorganen und Messwerten
- das optionale Stromkreisverzeichnis beginnt nach den Messwertseiten immer auf einer eigenen neuen Seite und besitzt eine klare Tabellenüberschrift
- PDF-, API- und PWA-Smoke-Tests sichern die neue Seitenfolge, A4-Ausgabe und getrennte Bereichsnavigation; eine Datenbankmigration ist nicht erforderlich

## [0.39.0] – Integriertes VDE-Prüfmodul

- die vorhandene V15-Prüfprotokoll-Anwendung ist als erstes vollständig angebundenes, firmenweit aktivierbares Elektro-Spezialmodul direkt aus der Schäfchen-Baustellenakte erreichbar
- Firma, Logo, Kunde, Projekt, Baustelle und Prüfer werden aus dem gemeinsamen Bestand referenziert; das Fachmodul erzeugt keine parallelen Stammdaten
- Verteilungen, FI/RCD-Gruppen, direkte Stromkreise, Schutzorgane und Messwerte werden strukturiert gespeichert; die manuelle Reihenfolge bleibt bis in das Abschluss-PDF erhalten
- RCD-Auslösezeit und -strom liegen am jeweiligen Stromkreis, Zi, Zs und Ik bleiben getrennte Messwerte, und LS, FI/LS, NH, Diazed, Neozed sowie sonstige Schutzorgane zeigen nur ihre passenden Parameter
- Stromkreisverzeichnis und detaillierte Isolationsmessung sind ausdrücklich optional; die zusätzlichen RISO-Leiterwerte erscheinen nur bei aktivierter Detailmessung
- der mobile Editor bietet eine unterstützende Plausibilitätsanzeige, lokale Entwurfssicherung ohne Signatur und einen V15-JSON-Import mit optional unverändert bewahrtem Original-PDF
- der Abschluss verlangt Prüfungsart, Verteilung, benannte Stromkreise und Prüferunterschrift; die serverseitig erzeugte A4-PDF besitzt Firmenlogo und Fußzeile, beginnt die Stromkreise bewusst auf Seite zwei und wird einmal zentral mit der Baustelle verknüpft
- abgeschlossene Prüfungen und ihre vollständige Versionshistorie sind unveränderlich; Deaktivierung des Moduls löscht weder Fach- noch Dokumentdaten
- Migration 036, RLS, zusammengesetzte Mandanten-Fremdschlüssel, Idempotenz-UUID, Rollen- und Tageszuweisungsprüfung sowie SQL-, Validierungs-, PDF-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern den Ablauf

## [0.38.0] – Automatischer Feiertagskalender

- der deutsche Feiertagskalender berechnet nach Rechtsstand 29.07.2026 die neun bundesweiten und die landesweiten Regeln aller 16 Bundesländer einschließlich beweglicher Feiertage reproduzierbar für 2000 bis 2100
- der bestehende Schaaf-Mandant ist auf Sachsen vorkonfiguriert; Administration und Geschäftsführung ändern das Bundesland versionsgeschützt, Planungsrollen dürfen die Berechnungsgrundlage lesen
- gesetzliche sowie bestätigte örtliche oder betriebliche freie Tage setzen das Tagessoll vor der Stundenkontoberechnung auf null; geleistete Feiertagsarbeit bleibt als positive Kontobewegung sichtbar
- kommunale Sonderfälle und Betriebsschließtage werden mit Datum, Bezeichnung, Pflichtgrund, Client-UUID und Ersteller unveränderlich angelegt
- fehlerhafte freie Tage werden nicht gelöscht, sondern mit Pflichtbegründung aufgehoben und bleiben vollständig in der Historie
- Mitarbeiter sehen die berücksichtigten Feiertage im eigenen Stundenkonto; die Büro-Jahresübersicht bündelt Bundesland, Jahreskalender und Verwaltung zusätzlicher freier Tage
- Migration 035, Row Level Security, zusammengesetzte Mandanten-Fremdschlüssel sowie SQL-, Validierungs-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern Kalenderregeln, Sollwirkung, Rollen, Versionskonflikte und Mandantentrennung

## [0.37.0] – Stundenkonten und Jahresübersicht

- jeder Mitarbeiter sieht in der bestehenden Wochenansicht sein fortlaufendes Stundenkonto mit Jahres-Soll, Ist, Abwesenheitsgutschrift, laufendem Stand und zwölf kompakten Monatszeilen
- Planungsrollen erhalten eine kompakte Jahresübersicht aller aktiven Mitarbeiter mit Saldo, Resturlaub und genehmigtem Überstundenabbau
- Administration und Geschäftsführung pflegen Aktivierung, Startdatum und kalenderjahrbezogenen Urlaubsanspruch; getrennte Versionsstände verhindern verlorene parallele Änderungen
- Migration 034 verbindet eingefrorene Tagessollwerte, Wochensoll, Arbeitsminuten und freigegebene Abwesenheiten in einer reproduzierbaren Tagesberechnung
- Urlaub, Krankheit und neutrale Abwesenheiten schreiben das volle beziehungsweise halbe Soll gut; Überstundenabbau reduziert das Konto um das betroffene Soll
- manuelle Startsalden, Korrekturen und Auszahlungen besitzen eine Client-UUID, Pflichtbegründung, Löschschutz und unveränderliche Historie; Fehler werden per Gegenbuchung berichtigt
- Row Level Security, zusammengesetzte Mandanten-Fremdschlüssel sowie SQL-, Validierungs-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern Rollen, Jahre, Abwesenheitswirkung und Mandantentrennung

## [0.36.0] – Abwesenheiten und Urlaubsfreigabe

- Mitarbeiter beantragen Urlaub, Überstundenabbau, Freistellung, Krankheit, Lehrgang, Berufsschule und weitere Abwesenheiten selbst in ihrer Wochenansicht; ganze und halbe Tage werden unterstützt
- jeder Antrag durchläuft zuerst die Büroprüfung und anschließend die verbindliche Freigabe durch die Geschäftsführung
- Büroprüfung und Geschäftsführungsfreigabe müssen von zwei verschiedenen Konten erfolgen; Ablehnungen, Zurückziehen und Aufheben einer Freigabe benötigen eine Begründung
- freigegebene Abwesenheiten erscheinen in persönlicher Woche, Büro-Wochenplanung und Tageslage; ganztägig abwesende Mitarbeiter zählen nicht als frei verfügbar
- vorhandene Einsätze blockieren die verbindliche Volltagsfreigabe, bis sie verschoben oder storniert wurden; danach verhindert eine gemeinsame transaktionale Sperre neue Planungskonflikte
- Migration 033 speichert Anträge und ihre unveränderliche Ereignishistorie mandantengetrennt, versionsgeschützt und ohne fachliches Hartlöschen
- Validierungs-, SQL-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern Rollenfolge, Vier-Augen-Regel, Planungskonflikte, Historie und Mandantentrennung

## [0.35.0] – Einsatzdetails und Tagesdisposition

- Einsätze erhalten eine optionale geplante Dauer und eine konkrete Arbeitsanweisung; beides kann beim Anlegen und bei einer historisierten Änderung gepflegt werden
- Startzeit, Dauer und Arbeitsauftrag erscheinen in der Büro-Wochenplanung, in der Tagesliste, am mobilen Tageseinsatz und in der Baustellenakte
- die Baustellenakte zeigt das heutige Team mit Rolle, geplanter Dauer und vorhandenen Telefon- oder E-Mail-Kontaktdaten; Telefon und Mail sind mobil direkt erreichbar
- Mitarbeiterstammdaten umfassen jetzt optionale Telefonnummer und E-Mail-Adresse und bleiben versionsgeschützt bearbeitbar
- eine neue Tageslage fasst für Büro und Disposition eingeplante sowie nicht eingeplante Feldmitarbeiter, laufende Arbeitstage und offene Zeitprüfungen zusammen
- bestehende Einsatz- und Mitarbeiterfelder werden wiederverwendet; es ist keine neue Datenbankmigration erforderlich
- zusätzliche Validierungs-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern Dauer, Arbeitsanweisung, Kontaktdaten und Tagesdisposition

## [0.34.0] – Direkte Baustellenabläufe

- der heutige Einsatz bietet Navigation und Baustellenakte als eindeutige Schnellaktionen, ohne den großen Zeitbuchungs-Schritt zu verdrängen
- berichtsverantwortliche Mitarbeiter können den Baustellenbericht schon während des Einsatzes speichern und bleiben dabei auf der Baustelle; beim späteren Verlassen wird der vorhandene Bericht wiederverwendet
- Monteure ändern den Status sichtbarer Baustellenaufgaben direkt von Offen zu In Arbeit und Erledigt oder öffnen eine erledigte Aufgabe erneut
- die mobile Aufgaben-API prüft Tageszuweisung, Baustelle, Mitarbeiterzuordnung, Rollen, erlaubte Statusfolge und Versionsstand serverseitig; Archivieren bleibt dem Büro vorbehalten
- Büro und Disposition erreichen Einsatzplanung, Bericht, Dokument und Aufgabe direkt aus dem geöffneten Baustellen-Dashboard; die Baustelle wird automatisch vorausgewählt
- die dokumentierte Plancraft-Featureprüfung trennt bewusst übernommene Arbeitsmuster von späteren oder für Schäfchen ungeeigneten Modulen

## [0.33.0] – Persönlicher PDF-Stundenzettel und einfache Baustellen

- Mitarbeiter laden ihre eigenen freigegebenen oder abgerechneten Stundenzettel jetzt direkt als übersichtliches A4-PDF oder weiterhin als Excel-Datei herunter
- das persönliche PDF enthält Tageszeiten, Baustellen, Status, Soll-, Arbeits-, Pausen-, Fahrt- und Mehrzeit sowie eine klare Gesamtsumme und Unterschriftsfelder
- der Büro-PDF-Export beginnt für jeden Monteur auf einer eigenen Seite und behält die Sortierung nach Mitarbeiter und Datum bei
- die Baustellenansicht ist eine einzige flache, durchsuchbare Liste ohne sichtbare Projektebene und ohne doppelte Verwaltungsordner
- neue Baustellen benötigen in der Oberfläche nur Kunde, Baustellenname, Aufgabe und Adresse; die notwendige interne Datenbankzuordnung übernimmt Schäfchen automatisch
- die Baustellen-Importvorlage wurde auf Kunde und Baustelle reduziert, neu gegliedert und mit einer kurzen Anleitung versehen
- Bautagesberichte und Montagescheine zeigen in der finalen PDF nur noch Kunde und Baustelle statt einer zusätzlichen Projektzeile

## [0.32.0] – Persönlicher Stundenzettelexport und Wochenvergleich

- Mitarbeiter können ausschließlich ihre eigenen vom Büro freigegebenen oder bereits abgerechneten Stundenzettel als Excel-Datei exportieren
- der persönliche Endpunkt erzwingt Mitarbeiter- und Mandantentrennung serverseitig; unfertige oder nur abgeschlossene Tage gelangen nicht in die Datei
- die Wochenansicht wechselt zwischen vergangenen Wochen und der aktuellen Woche, ohne zukünftige leere Wochen anzubieten
- Status zeigen eindeutig „Freigegeben“ beziehungsweise „Abgerechnet“ und kennzeichnen exportierbare Tage
- Wochensumme und Tageskarten zeigen zusätzlich Soll- und Mehrzeit; der Export meldet Server- und Zeitraumfehler direkt in der Oberfläche

## [0.31.0] – Zeiterfassung, Berichte und Baustellenablage aufgeräumt

- die Büro-Wochenprüfung gruppiert Stundenzettel nach Monteur und zeigt Tage, Wochenstunden, Warnungen sowie kompakte Freigabe- und Abrechnungsaktionen ohne überdeckende Schaltflächen
- beim spontanen Einsatz können Monteure einen vorhandenen Kunden und ein vorhandenes Projekt verwenden oder Kunde, Projekt und Baustelle vollständig in einem geführten Ablauf anlegen
- der Excel-Export enthält eine Mitarbeiterübersicht, ein eigenes nach Datum sortiertes Tabellenblatt je Monteur, sichtbare Arbeitsstundensummen und weiterhin die unveränderliche Buchungshistorie
- Bautagesbericht und Montageschein erhalten Teamstundensumme, Vollständigkeitsprüfung, lokalen Entwurf sowie optionale Angaben zu Witterung, Material, Geräten, Absprachen, Behinderungen, offenen Punkten und Vorfällen
- die freigegebene Berichts-PDF übernimmt alle strukturierten Zusatzangaben und verwendet die eindeutige Bezeichnung Montageschein
- der Bereich Baustellen zeigt Kunde → Projekt → Baustelle als durchsuchbare Hauptablage; doppelte Verwaltungslisten entfallen und Formulare erscheinen nur noch zum gezielten Anlegen oder Bearbeiten
- zentrale Dokumentablage ist standardmäßig eingeklappt; häufige Aktionen zum Anlegen und Bearbeiten liegen direkt am passenden Kunden oder Projekt

## [0.30.0] – Zeiterfassung vollständig

- beendete Arbeitstage erscheinen ohne zusätzlichen Einreich-Schritt automatisch im Büro; die Oberfläche bündelt den Ablauf in „In Arbeit“, „Abgeschlossen“ und „Abgerechnet“
- Büro, Projektleitung und Geschäftsführung sehen alle laufenden und abgeschlossenen Stundenzettel samt Warnhinweisen und können abgeschlossene Tage direkt prüfen und abrechnen
- Mitarbeiter erhalten die geplante Baustelle als Vorschlag, dürfen eine andere vorhandene Baustelle wählen oder eine fehlende Baustelle mit Projekt und Adresse zur Bürobestätigung anlegen
- fehlende Buchungen lassen sich mit Zeitpunkt, Buchungsart, Baustelle und Pflichtgrund ergänzen; falsche Buchungen werden nachvollziehbar als ungültig beantragt statt gelöscht
- Zeitkorrektur, Ergänzung und Ungültigmarkierung verwenden denselben Freigabeworkflow und bewahren Original, Grund, Entscheidung und Prüfer dauerhaft
- Excel-Export für frei wählbare Zeiträume, Mitarbeiter und Status enthält Tageswerte, Warnhinweise und die vollständige Buchungshistorie
- automatische Pausen bleiben bei 3,5 Stunden mit 30 Minuten und ab 6 Stunden mit insgesamt 60 Minuten wirksam; Fahrtzeit zählt zur Arbeitszeit
- Migration 032, erweiterte API-/Validierungs-/PWA-/PostgreSQL-Tests und Rechenregel Version 3

## [0.29.0] – Stundenzettel prüfen und abrechnen

- Monteure reichen einen vollständig beendeten Tages-Stundenzettel direkt in der Wochenansicht zur Prüfung ein
- Büro und Geschäftsführung geben eingereichte Tage frei und sperren sie anschließend nachvollziehbar als abgerechnet
- Start- und Wochenansicht zeigen eindeutig Offen, Zur Prüfung, Freigegeben oder Abgerechnet
- nach Einreichung sind neue reguläre Buchungen ausgeschlossen; offene Korrekturen verhindern eine verfrühte Freigabe
- begründete Korrekturanträge bleiben auch nach der Abrechnung möglich, während das Original historisch erhalten bleibt
- neue Migration 031 trennt die erlaubte Korrekturanfrage von verbotenen neuen Buchungen an gesperrten Tagen

## [0.28.1] – Korrektur auch auf Start

- der rote Korrekturzugang steht wieder direkt an jeder synchronisierten Buchung im Start-Stundenzettel
- bereits eingereichte Änderungen zeigen dort eindeutig „Prüfung offen“
- die vollständige Korrekturmöglichkeit im Wochen-Stundenzettel bleibt zusätzlich bestehen

## [0.28.0] – Wochen-Stundenzettel

- neuer vollständiger Wochen-Stundenzettel mit Arbeit, Pause und Fahrt als Wochensumme
- Montag bis Sonntag werden als ruhige Tageskarten mit Status, Tageswerten und allen einzelnen Buchungen dargestellt
- Zeitkorrekturen können an der passenden Buchung im Wochen-Stundenzettel geöffnet werden
- Korrekturen erscheinen als kompakte mobile Eingabefläche; bis zur Prüfung bleibt die bisherige Uhrzeit sichtbar
- offene Korrekturen liegen für berechtigte Bürorollen direkt im Bereich Woche statt in der Einsatzplanung
- neuer geschützter Wochenendpunkt liefert die eigenen sieben Kalendertage einschließlich wirksamer Buchungen und Wochensummen

## [0.27.0] – Nachvollziehbare Zeitkorrekturen

- Mitarbeiter können eine synchronisierte eigene Zeitbuchung direkt im Stundenzettel mit neuer Uhrzeit und Pflichtbegründung zur Prüfung einreichen
- bis zur Entscheidung bleibt ausschließlich die unveränderte Originalzeit wirksam
- offene Korrekturen erscheinen mit alter und gewünschter Uhrzeit zur Prüfung im Stundenzettel
- Planung und Geschäftsführung können Anträge genehmigen oder ablehnen; Genehmigungen entwerten das Original historisch und berechnen den Stundenzettel neu
- API prüft Mandant, Eigentümer, Arbeitstag, Zeitreihenfolge und Baustellenfolge vor Antrag und Genehmigung
- Validierungs-, PostgreSQL-Integrations- und PWA-Smoke-Tests sichern den vollständigen Ablauf

## [0.26.1] – Modulumfang auf VDE und DGUV begrenzt

- LWL und KNX vollständig aus API, Modulplanung und aktueller Produktdokumentation entfernt
- nur VDE und DGUV bleiben als aktivierbare Elektro-Spezialmodule vorgesehen
- neue Migration 030 verhindert auch auf Datenbankebene neue LWL- oder KNX-Freigaben
- SQL-, API-, PostgreSQL- und Validierungstests an den verbindlichen Modulumfang angepasst

## [0.26.0] – Grundlage für optionale Elektro-Module

- firmenbezogene Modulfreigaben für VDE, DGUV, LWL und KNX
- Aktivierung ausschließlich durch Administration oder Geschäftsführung
- serverseitiger Mandantenfilter, Versionskonfliktschutz und unveränderliche Änderungshistorie
- deaktivierte und noch nicht fachlich angebundene Module bleiben vollständig aus der Oberfläche ausgeblendet
- Migration 029 sowie SQL-, API-, PostgreSQL- und Validierungstests

## [0.25.1] – Netto-Arbeitszeit im Stundenzettel

- die große rote Stundenzettel-Anzeige zeigt jetzt die tatsächliche Netto-Arbeitszeit
- Pausen und Unterbrechungen zwischen mehreren Arbeitsblöcken werden sichtbar von der Bruttozeit abgezogen
- Bruttozeit, Pause, Arbeit und Fahrt bleiben zur Kontrolle getrennt ausgewiesen
- PWA-Smoke-Test schützt die Nettoanzeige vor einer erneuten Verwechslung mit der Bruttozeit

## [0.25.0] – Gemeinsame Baustellennotizen

- eigener ruhiger Notizbereich direkt in jeder Baustelle statt einer globalen Aktivitätschronik
- Büro und berechtigt eingeplante Mitarbeiter lesen denselben mandantengetrennten Notizbestand
- kurze Hinweise können als wichtig markiert und mit Verfasser sowie Zeitpunkt angezeigt werden
- idempotente Speicherung verhindert doppelte Notizen bei wiederholtem Absenden
- Migration 028, RLS, Löschschutz sowie erweiterte SQL-, API-, PostgreSQL- und PWA-Tests

## [0.24.0] – Mehrere Arbeitsblöcke pro Tag

- nach Feierabend kann derselbe Arbeitstag mit einer großen Schaltfläche erneut gestartet werden
- jeder Arbeitsbeginn und jeder Feierabend bleiben als eigener unveränderlicher Zeitblock erhalten
- Unterbrechungen zwischen zwei Arbeitsblöcken zählen als Pause und nicht als Arbeitszeit
- Datenbank-Rechenregel Version 2 sowie erweiterte SQL-, API-, PostgreSQL- und PWA-Tests

## [0.23.0] – Mitarbeiter, Vorarbeiter und strukturierte Berichte

- Mitarbeiterstammdaten und Betriebsrollen lassen sich geschützt bearbeiten; parallele Änderungen werden über den Versionsstand erkannt
- manuell eingeplante Vorarbeiter werden technisch von der automatischen Verantwortung eines allein eingesetzten Monteurs unterschieden
- der einzige Mitarbeiter einer Baustelle übernimmt automatisch die Vorarbeiter- und Berichtsfunktion, ohne dauerhaft die Mitarbeiterrolle Vorarbeiter zu erhalten
- sobald das Team vergrößert wird, endet die automatische Vorarbeiterfunktion; ein manuell bestimmter Vorarbeiter bleibt verbindlich
- Montage- und Bautagesberichte erfassen ausgeführte Leistungen, Behinderungen, offene Punkte und die Stunden aller eingeplanten Mitarbeiter
- Mitarbeiter und Namen werden serverseitig gegen die Tagesplanung geprüft; Abschluss-PDFs übernehmen die strukturierte Gliederung
- neue Migrationen 025 und 026 sowie erweiterte SQL-, API-, PostgreSQL-, PDF- und PWA-Tests

## [0.22.0] – Mobile Baustellenakte

- der bisherige Details-Hinweis des Tageseinsatzes öffnet jetzt die echte Baustellenakte
- übersichtliche Themenkarten für Arbeitsauftrag, Mitarbeiter, Aufgaben, Berichte, Dokumente, Fotos und Material
- Monteure und Vorarbeiter dürfen ausschließlich am betreffenden Tag zugewiesene Baustellen öffnen; Planungsrollen behalten den vollständigen Zugriff
- Aufgaben werden für Monteure auf eigene und allgemeine Baustellenaufgaben begrenzt, während Vorarbeiter das gesamte Baustellenteam sehen
- Baustellenfotos können direkt aufgenommen werden und landen ohne Kopie im zentralen Dokumentenbestand
- die zuletzt geladene Baustellenübersicht bleibt als kleine Offline-Ansicht auf dem Gerät verfügbar
- PostgreSQL-Integrationstest für berechtigten und verbotenen Zugriff, Rollenunterschiede, Foto-Upload und geschützten Dateiabruf

## [0.21.0] – Mobile Vorarbeiterberichte

- tägliche Vorarbeiter- und Berichtsverantwortung direkt in der Einsatzplanung
- mobile Montage- oder Bautagesberichte beim Verlassen der Baustelle
- serverseitige Rollen-, Einsatz-, Baustellen- und Datumsprüfung sowie Abfahrtssperre ohne Pflichtbericht
- offline-fähige, idempotente Berichtsübertragung vor der zugehörigen Zeitbuchung
- Migration und automatisierte Tests für eindeutige Zuständigkeit und unverwechselbare Bericht-zu-Einsatz-Verknüpfung

### Hinzugefügt

- initiale Repository- und Ordnerstruktur
- Docker-Compose-Umgebung mit PostgreSQL, pgAdmin, MinIO und n8n
- Umgebungsvariablen-Vorlage ohne produktive Zugangsdaten
- Migration 001 für die SaaS-Mandantentabelle `companies`
- automatische Firmennummern, Aktivstatus, Deaktivierungszeitpunkt und Versionszähler
- vorbereitete Row-Level-Security-Policy für Mandantentrennung
- Schutz gegen hartes Löschen von Firmen
- erster Seed-Datensatz Schaaf Elektro GmbH
- SQL-Abnahmetest für Migration 001
- GitHub Actions für Compose- und Datenbankprüfung
- lokale Befehle für Migrationen, Seeds, Tests, Backup und Restore
- Architektur- und Projektstatusdokumentation
- Migration 002 für Benutzer mit Personalnummer-Login, Aktivhistorie und Mandantenschutz
- Migration 003 für anpassbare Rollen, historische Mehrfachzuweisungen und Standardrollen Admin, Büro, Vorarbeiter und Monteur
- eigene eingeschränkte Datenbankrolle `schaefchen_api` mit erzwungener Row Level Security
- automatische Pflege des Vorarbeiterstatus aus aktiven Rollenzuweisungen
- dokumentierte UI-Spezifikation für Login und Dashboard
- mobiloptimierte, installierbare PWA-Vorschau ohne vorgetäuschte Serveranmeldung
- PWA-Smoke-Test und GitHub-Pages-Veröffentlichungsworkflow
- Migration 004 für Privat- und Firmenkunden, automatische Kundennummern, Debitorennummern, Archivierung und Dubletten-Zusammenführung
- Migration 005 für mehrere Kundenansprechpartner, feste Zuständigkeiten und einen aktiven Hauptkontakt
- Migration 006 für Kundenstandorte mit automatischer Standortnummer, Adresse, optionalem Geocoding und Rechnungsstandort
- Migration 007 für Projekte mit Jahresnummer, Priorität, Status, Standort- und Verantwortlichenhistorie
- Migration 008 für Baustellen mit Jahresnummer, flachen Bereichen, QR-Code, Pinnwand und Statushistorie
- erzwungene Mandantentrennung und Löschschutz für die Auftragsgrundlage
- SQL-Abnahmetests für Migrationen 004 bis 008
- idempotente Doppelanwendung aller Migrationen in GitHub Actions
- automatischer PostgreSQL-Backup-/Restore-Abnahmetest
- technische Sprint-1-Dokumentation für Kunden, Projekte und Baustellen
- Migration 009 für mehrfache, geordnete Tagesbaustellen mit Freigabe und Änderungshistorie
- Migration 010 für mehrere Vorarbeiter, genau einen aktiven Hauptvorarbeiter und automatische Berichtsübergabe
- Migration 011 für individuelle Wochen-Sollzeiten, berechnete Arbeitstage und Abrechnungssperre
- Migration 012 für unveränderliche Offline-Zeitereignisse, Client-ID-Dublettenschutz und Korrekturanträge
- automatische Pausen-, Arbeits-, Fahr- und Mehrarbeitsberechnung mit versionierter Rechenregel
- SQL-Abnahmetests für Migrationen 009 bis 012 und erweiterte Backup-/Restore-Prüfung
- interaktive Sprint-2-PWA-Demo mit zwei Einsätzen, lokalem Stundenzettel und dauerhafter Gerätespeicherung
- vollständige Sprint-2-Dokumentation für Planung, Zeiterfassung, Korrekturen und Offline-Verhalten
- Schaaf-Elektro-Farbsystem in Rot, Schwarz und Weiß für PWA, App-Symbol und Browserdarstellung
- Migration 013 für ablaufende und widerrufbare Benutzersitzungen mit ausschließlich gehashten Tokens
- technische API-Login-Rolle ohne eigene Tabellenrechte und serverseitiger Mandantenkontext je Transaktion
- Node-API für Personalnummer-Anmeldung, Sitzungsprüfung, Abmeldung, eigenen Arbeitstag und Offline-Zeitbuchungen
- `scrypt`-Passwort-Hashing, sichere Cookies, Login-Sperre, exakte Herkunftsprüfung und begrenzte JSON-Anfragen
- idempotente Offline-Synchronisation mit Schritt-, Zeit-, Baustellen- und Zuweisungsprüfung
- Docker-API-Dienst, lokale API-Befehle und PostgreSQL-Integrationstest in GitHub Actions
- Migration 014 für eine einmalige, schlüsselgeschützte Admin-Ersteinrichtung
- gleicher HTTPS-Ursprung für installierbare PWA und API mit echtem Login
- mobile Offline-Warteschlange mit idempotenter Synchronisation und benutzergetrenntem Gerätespeicher
- API für freigegebene eigene Tageseinsätze und serverseitige PWA-Auslieferung mit Sicherheitsheadern
- Produktionscontainer, automatischer Migrationsstart und Render-Blueprint für Webdienst und PostgreSQL
- Render-Fix: Migrationseigentümer darf RLS für Schemaaufbau umgehen, während die API-Rolle weiterhin vollständig RLS-gebunden bleibt
- zusätzlicher CI-Migrationslauf mit einem nicht privilegierten Render-ähnlichen Datenbankeigentümer
- Render-kompatible Härtung der technischen Login-Rolle ohne verbotene Superuser-Attributänderung
- mobile Verwaltung unter „Mehr“ für Mitarbeiter, Kunden-/Projekt-/Baustellenpakete und freigegebene Einsätze
- serverseitige Rollenprüfung: Admin und Büro planen, ausschließlich Admin darf Bürokonten anlegen
- persönliche Startpasswort-Änderung bei der ersten Anmeldung neuer Mitarbeiter
- PostgreSQL-Integrationstest für Verwaltung, Rollentrennung, Passwortwechsel und sichtbare Mitarbeiterzuweisung
- iOS-Cache-Reparaturseite und netzwerkbevorzugte Navigation gegen dauerhaft veraltete PWA-Oberflächen
- Migration 015 für die gleichberechtigten Rollen Planer, Projektleiter und Assistenz der Geschäftsführung
- mobile Wochenplanung Montag bis Freitag mit allen Mitarbeitern und Einsätzen
- begründetes Verschieben und Stornieren von Einsätzen unter Erhalt der Änderungshistorie
- Versionsstand 0.8.0
- sicherer Excel-Import für Wochenpläne im vorhandenen Baustellenplan-Format
- Importvorschau für X-Zuweisungen mit eindeutiger Mitarbeiter- und Baustellenzuordnung
- Schutz bestehender Mitarbeitertage vor Überschreiben und Dublettenschutz bei Wiederholungen
- Erkennung von Abwesenheits- und Sonderkürzeln ohne automatische Übernahme
- Größen-, Dateityp- und Archivprüfung für hochgeladene XLSX-Dateien
- Versionsstand 0.9.0
- geschützter Excel-Import für mehrere Kunden-, Projekt- und Baustellenpakete
- herunterladbare Baustellen-Importvorlage mit Pflichtfeldern und PLZ-Textformat
- Vorschau für neue, bereits vorhandene und fehlerhafte Baustellenzeilen
- ausdrückliche Zuordnung unbekannter Mitarbeiter- und Baustellenbezeichnungen aus Wochenplänen
- Wiederverwendung eindeutig vorhandener Kunden und Schutz vor doppelten aktiven Baustellennamen
- Versionsstand 0.10.0
- verbindliche Produktvision für Schäfchen als modulare All-in-One-Unternehmenssoftware
- Migration 016 für Geschäftsführer, Administrator, Büro/Disposition, Projektleiter, Vorarbeiter und Monteur
- kompatibler Erhalt früherer Büro-, Planer- und Assistenzrollen ohne Neuanlage in der Oberfläche
- normaler Login nur mit Personalnummer und Passwort; Firmennummer bleibt nach der Einrichtung verborgen
- getrennte Start-, Wochen- und Mehr-Ansichten für ein ausschließlich live orientiertes Mitarbeiter-Dashboard
- kompakte Live-Anzeige für Status, Baustelle, Statusbeginn, Arbeitszeit und Vorarbeiterstatus
- gegliedertes Baustellen-Dashboard mit aufklappbaren Themenbereichen statt Aktivitätschronik
- dokumentiertes Ein-Dokument-Prinzip, Mandantenlogo-Grenze und modularer Ausbaupfad
- Versionsstand 0.11.0
- unruhigen, doppelten Live-Übersichtsblock wieder entfernt
- Statusbeginn und Arbeitszeit platzsparend in die bestehende Arbeitskarte integriert
- Vorarbeiterkennzeichnung erscheint nur für tatsächliche Vorarbeiter
- CSS und JavaScript werden versionsgebunden geladen, damit iPhones keine alte Gestaltung mit neuem HTML mischen
- Versionsstand 0.11.1
- getrennte Anlage von Firmen- und Privatkunden, Projekten und Baustellen
- eindeutige serverseitige Zuordnung Projekt → Kunde und Baustelle → Projekt mit Mandantenschutz
- mobile Betriebsstruktur mit aufklappbarer Hierarchie Kunde → Projekt → Baustelle
- Kunden- und Projektauswahl statt wiederholter Freitexteingabe bei der Baustellenanlage
- bestehender Excel-Schnellimport und Paket-Endpunkt bleiben kompatibel
- Versionsstand 0.12.0
- Excel-Wochenplan als Unterfunktion der Einsatzplanung gruppiert
- Excel-Baustellenliste als Unterfunktion der Baustellenplanung gruppiert
- Verwaltungsmenü von einzelnen Import-Hauptpunkten befreit
- Versionsstand 0.12.1
- direkte Navigationspunkte für Einsätze und Baustellen bei Planungsrollen
- rollenabhängige Navigation mit fünf Bereichen für Planer und unverändert drei Bereichen für Monteure
- Mehr auf Mitarbeiterverwaltung und ergänzende Einstellungen reduziert
- redundante zusätzliche Planungsebene entfernt
- Versionsstand 0.13.0
- separate Excel-Aufklappkarten aus Einsatz- und Baustellenplanung entfernt
- Dateiauswahl und Drag-and-drop ohne zusätzlichen Klick direkt sichtbar gemacht
- Excel-Import weiterhin mit sicherer Vorschau und ausdrücklicher Bestätigung
- Versionsstand 0.13.1
- roter Button „Baustelle anlegen“ bleibt unverändert als wichtigste manuelle Aktion erhalten
- kompakte, dauerhaft sichtbare Excel-Fläche direkt unter „Baustelle anlegen“ integriert
- Dateiauswahl und Vorlagenlink sofort sichtbar; Dateiname und Prüfung erst nach Auswahl eingeblendet
- Versionsstand 0.13.2
- „Einsatz freigeben“ bleibt als wichtigste manuelle Aktion unverändert erhalten
- Excel-Wochenplan dauerhaft und kompakt direkt unter „Einsatz freigeben“ integriert
- freigegebene Einsatzliste folgt erst nach manueller und Excel-Planung
- Versionsstand 0.13.3
- durchsuchbare Baustellenliste nach Name, Kunde, Projekt, Nummer, Adresse und Ort
- Statusfilter für aktive, abgeschlossene, archivierte oder alle Baustellen
- Baustellen-Dashboard mit sichtbarem Status und vollständiger Bearbeitungsmaske
- Änderung von Baustellenname, Monteurauftrag, Adresse und Status
- optimistische Versionsprüfung gegen unbeabsichtigtes Überschreiben paralleler Änderungen
- Schutz vor Abschluss oder Archivierung bei aktuellen und zukünftigen Einsätzen
- Reaktivierung abgeschlossener oder archivierter Baustellen bei aktivem Kunden und Projekt
- Versionsstand 0.14.0
- dauerhaft sichtbare Kunden- und Projektverwaltung getrennt von den jeweiligen Anlegeformularen
- Suche nach Kundenname, Nummer, Kontakt und Ort sowie Projektname, Nummer und Kunde
- Statusfilter für aktive und archivierte Kunden sowie laufende, abgeschlossene und archivierte Projekte
- geschützte Bearbeitung von Kundenstammdaten, Rechnungsadresse, Projektname, Kurztext und Status
- optimistische Versionsprüfung für Kunden und Projekte gegen paralleles Überschreiben
- Archivierung eines Kunden nur ohne aktive Projekte; Projektabschluss nur ohne aktive Baustellen
- aktive Auswahllisten und Betriebsstruktur blenden abgeschlossene oder archivierte Stammdaten aus
- Versionsstand 0.15.0
- Migration 017 für zentrale Dokumentmetadaten, getrennten Dateiinhalt und Verknüpfungen zu Kunde, Projekt und Baustelle
- Ein-Dokument-Prinzip mit SHA-256-Dublettenschutz und Wiederverwendung vorhandener Dateien ohne Kopie
- sicherer Upload von PDF, Bild, Text, XLSX und DOCX bis 5 MB sowie sitzungsgeschützter Download
- automatische Ableitung von Projekt und Kunde bei Dokumentzuordnung zu einer Baustelle
- Dokumentarchivierung und Reaktivierung mit Versionskonflikt-, Lösch- und Mandantenschutz
- sichtbare zentrale Dokumentverwaltung im Bereich Baustellen sowie Dokumente direkt im Baustellen-Dashboard
- Dokumentanzahl und direkter Einstieg aus Kunden- und Projektverwaltung
- Versionsstand 0.16.0
- Migration 018 für die serverseitige Firmenlogo-Zuordnung der Startfirma
- originales Schaaf-Elektro-Firmenlogo aus dem bestehenden VDE-Prüfprotokoll in Login und Kopfbereich
- getrennte Darstellung von Firmenlogo und unverändertem Schäfchen-Markenlogo
- Logo-URL ausschließlich aus der serverseitig aufgelösten Firma; Initial bleibt der neutrale Fallback
- Firmenlogo im Offline-App-Cache und als gemeinsames Original für spätere PDFs und E-Mails
- Versionsstand 0.17.0
- Produktions-Upgradepfad für den kurzzeitig erweiterten alten Setup-Funktionsvertrag abgesichert
- Migration 019 prüft die stabilen getrennten V1-/V2-Verträge der Ersteinrichtung
- CI bildet den betroffenen Produktionsstand nach und prüft Vorabreparatur, Migrationen und Neustart
- Versionsstand 0.17.1
- Produktfokus auf Elektrobetriebe präzisiert; eine spätere Gewerkeerweiterung bleibt auf Basis des gemeinsamen Kerns möglich
- direkter Kamerazugriff „Lieferschein fotografieren“ im Dokumentbereich einer geöffneten Baustelle
- Lieferschein-Foto wird nur einmal zentral gespeichert und automatisch zu Baustelle, Projekt und Kunde verknüpft
- Lieferscheine serverseitig auf JPG, PNG und WebP bis 5 MB begrenzt
- geordneter Umsetzungsplan aus dem Projekt-GPT „Render für Web-App Hosting“ dokumentiert
- Versionsstand 0.18.0
- Migration 020 für priorisierte und optional zugewiesene Baustellenaufgaben mit Fälligkeit und Abschlussstatus
- Migration 021 für Materialbedarf und die Statusfolge benötigt, bestellt, vor Ort und verbraucht
- Migration 022 für nummerierte Montage- und Bautagesberichte mit digitaler, fotografierter oder diktierter Erfassung
- echte Aufgaben-, Material- und Berichtsaktionen direkt im Baustellen-Dashboard ohne zusätzliche Hauptnavigation
- fotografierte Papierberichte werden einmal im zentralen Dokumentenbestand gespeichert und mit dem Bericht verknüpft
- ruhige Karten-, Formular- und Statusgestaltung nach den vereinbarten mobilen Designspezifikationen
- ausgeblendete Platzhalter für noch nicht aktivierte Baustellenmodule
- SQL-Abnahmetests, API-Integrationstest und PWA-Smoke-Test für die neuen Arbeitsmodule
- Versionsstand 0.19.0
- ursprüngliche mobile Höhe der Loginfelder und Position der Passwortanzeige wiederhergestellt
- neuer Frontend-Cache für die sofort sichtbare Korrektur auf installierten Geräten
- Versionsstand 0.19.1
- Migration 023 für Berichtfreigabe, zwei Unterschriften, historische Snapshots und Abschlussdokument
- mobile Touch-Unterschriften für Mitarbeiter beziehungsweise Vorarbeiter und Auftraggeber
- serverseitige, unveränderliche PDF-Ausgabe mit Firmenlogo und vollständigem Auftragsbezug
- automatische zentrale PDF-Verknüpfung zu Kunde, Projekt und Baustelle
- Versionsstand 0.20.0
