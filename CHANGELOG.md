# Changelog

Alle wesentlichen Änderungen an Schäfchen werden in dieser Datei dokumentiert.

## [Unreleased]

- **Gerätebestand und mobile Set-Anlage funktionieren fehlerfrei.** Die
  firmenweite Büro-/Admin-Liste bindet nur noch die von PostgreSQL tatsächlich
  verwendeten Parameter; die Fehlerreferenz beim Laden des Gerätebestands
  entfällt. Im Anlageformular werden versehentlich leere Zusatzteile entfernt,
  während unvollständige Teile eine konkrete Meldung wie „Teil 2: Kategorie
  fehlt“ erhalten statt des unklaren iOS-Hinweises „Feld ausfüllen“.
- Fassung 0.44.3, Speicher `schaefchen-online-v85`, Migration 099.

- **Geräteanlage, Zuordnung, QR-Etiketten und Sets sind jetzt ein durchgehender
  Bedienablauf.** Die Verwaltungsansicht bleibt sichtbar, wenn einzelne
  Geräte-Endpunkte vorübergehend ausfallen, und zeigt einen gezielten
  Wiederholungsweg statt einer leeren Seite.
  - Berechtigte Rollen finden „Gerät anlegen“ dauerhaft sichtbar. Das gegliederte
    Formular erfasst Inventar- und Seriennummer, Kategorie, Hersteller/Modell,
    festen und aktuellen Besitzer, Standort, Kaufdaten, Prüfung und Foto.
  - Nach dem Speichern erscheint das sichere QR-Etikett unmittelbar. Bei einem
    Koffer/Set werden Hauptgerät, Akkus, Ladegeräte und weitere beiliegende
    Teile transaktional als eigene Gegenstände mit je eigener Historie und
    eigenem QR-Code angelegt; ein gemeinsamer Druckbogen ist sofort verfügbar.
  - Vorhandene Geräte lassen sich nachträglich einem Set hinzufügen oder mit
    Pflichtgrund wieder daraus entfernen. Fester und aktueller Besitzer bleiben
    getrennte Relationen; administrative Zuordnungen laufen über die
    protokollierte Übergabelogik.
- Fassung 0.44.2, Speicher `schaefchen-online-v84`, Migration 098.

- **Die QR-Livekamera funktioniert jetzt auch auf iPhone und iPad.** Safari
  stellt die experimentelle `BarcodeDetector`-Schnittstelle standardmäßig
  nicht bereit. Schäfchen nutzt deshalb einen mitgelieferten lokalen Decoder
  für Livebilder und QR-Fotos; auf unterstützten Geräten bleibt die native
  Erkennung der schnelle Weg. Die Produktions-Sicherheitsrichtlinie erlaubt
  die Kamera nur der eigenen Schäfchen-Herkunft und weiterhin erst nach der
  ausdrücklichen Freigabe des Benutzers.
- Fassung 0.44.1, Speicher `schaefchen-online-v83`, Migration 097.

- **Maschinen & Geräte ist als vollständiger Schäfchen-Bereich verfügbar.**
  Maschinen, Werkzeuge, Mess- und Prüfgeräte, Akkus, Ladegeräte, Leitern und
  weitere Betriebsmittel besitzen einen eigenen mandantengetrennten
  Inventarstammsatz.
  - Jeder Gegenstand erhält einen zufälligen, nicht erratbaren QR-Token ohne
    Namen, Firma oder Inventarnummer. Einzelnes Etikett, Neudruck, bewusste
    Token-Rotation und Druckbogen verwenden immer denselben Gerätestammsatz.
  - Der mobile Ablauf ist auf „QR scannen → fertig“ reduziert: freie Geräte
    werden automatisch übernommen; fremde feste oder aktuelle Besitzer werden
    vor der bestätigten Übernahme deutlich genannt. Rückgabe, gezielte
    Übergabe, Baustellenablage und Lager sind direkt am Gerät erreichbar.
  - Fester Besitzer und aktueller Besitzer sind getrennte historisierte
    Relationen. Gleichzeitige Scans werden über Gerätesperre und Zeilenversion
    serialisiert; Offline-Wiederholungen sind über eine Client-ID idempotent
    und Konflikte werden serverseitig entschieden.
  - Akkus sind eigenständige Geräte mit Akkusystem, Spannung, Kapazität,
    Ladezyklen, Kapazitätstest und eigenem QR-Code. Gerätesets und
    Fahrzeugstandorte sind relational vorbereitet.
  - Defekte, Fotos, konfigurierbare Prüfungssperre, Wartungsfristen,
    Benachrichtigungen, schnelle QR-Inventur sowie unveränderliche Übergabe-,
    Prüf- und Audit-Historien sind angebunden.
  - Monteur, Vorarbeiter, Büro und Leitung erhalten getrennte Rechte;
    Plattformkonten haben keinen operativen Gerätezugriff. RLS, zusammengesetzte
    Mandanten-Fremdschlüssel und gleichförmige unbekannte QR-Antworten schützen
    Firmengrenzen.
- Fassung 0.44.0, Speicher `schaefchen-online-v82`, Migrationen 095 und 096.

- **Die untere Leiste ist auf dem Telefon wieder vollständig bedienbar.** Die
  neuen fachlichen Bereiche bleiben erhalten, erscheinen aber nicht mehr als
  lose Desktop-Überschriften zwischen den Schaltflächen.
  - Baustellenrollen sehen weiterhin „Start“, „Zeiten“ und „Mehr“. Planende
    Rollen erhalten zusätzlich „Planung“, „Doku“ und „Betrieb“ als gleich
    breite, antippbare Bereichsschalter mit Symbolen.
  - Planung öffnet Einsatzplanung und Baustellen, Dokumentation öffnet Berichte,
    Dokumentablage und Prüfprotokolle, Betrieb öffnet Kunden, Mitarbeiter und
    Fahrzeuge. Rollen und freigeschaltete Module bestimmen weiterhin, welche
    Ziele tatsächlich erscheinen.
  - Die vorherige Veröffentlichung verwendete für neues HTML und ältere
    Mobil-CSS dieselbe Fassungs- und Cachekennung. Dadurch konnte die
    installierte App beide Stände mischen. Eine neue Fassung und ein neuer
    App-Shell-Speicher verhindern diesen Zwischenstand zuverlässig.
- Fassung 0.43.2, Speicher `schaefchen-online-v81`, Migration 094.

- **Die mobile Startseite behält den abgenommenen Baustellenmodus.** Monteur,
  Vorarbeiter und Auszubildende sehen den Arbeitstag nur auf „Start“ und
  erreichen Woche, Einträge, Korrekturen und Arbeitskonto gesammelt über
  „Zeiten“. Die zusätzliche persönliche Zeiterfassungsseite erscheint nur für
  planende Rollen. Dunkle Arbeitskarte, große Begrüßung und die Reihenfolge
  „Online · Profil“ bleiben auf schmalen Bildschirmen erhalten.
- **Bereiche und Unterbereiche folgen jetzt einer eindeutigen fachlichen
  Ordnung.** Die Desktop-Navigation ist in „Meine Arbeit“, „Planung“,
  „Dokumentation“, „Betrieb“ und „Steuerung“ gegliedert; leere Rollen- oder
  Modulgruppen verschwinden vollständig. Auf dem Telefon verwendet „Mehr“
  dieselbe Gruppierung.
  - Die Woche zeigt mit „Überblick“, „Arbeitstage“, „Arbeitskonto“ sowie
    „Anträge & Prüfung“ immer nur den gewählten Unterbereich. Zeitkorrekturen
    und Abwesenheitsfreigaben öffnen direkt den passenden Reiter.
  - Einstellungen und Arbeitszeit-Auswertung besitzen echte umschaltbare
    Unterbereiche statt mehrerer langer Karten untereinander.
  - Auch die getrennte Plattformverwaltung ist nicht mehr flach: Firmen,
    Benutzer, Tarife und Module stehen unter „Mandanten“, operative
    Systemfunktionen unter „Betrieb“ und Datenschutz, Audit sowie globale
    Einstellungen unter „Kontrolle“. Berechtigungsbedingt leere Gruppen werden
    ausgeblendet.
  - Die sichtbare zweite Projektliste wurde aus Kunden und Baustellen entfernt.
    Bestehende Projektverknüpfungen, Datenbankbeziehungen, Formulare und APIs
    bleiben für Altbestände erhalten; die normale Bedienung arbeitet nur mit
    Kunde und Baustelle.
  - Doppelte Überschriften in eigenständigen Mitarbeiter-, Baustellen- und
    Dokumentseiten entfallen; globale Dokumentationsbereiche sind eindeutig
    von den gleichnamigen Inhalten einer einzelnen Baustelle benannt.
- Fassung 0.43.1, Speicher `schaefchen-online-v80`, Migration 093.

- **Schäfchen besitzt jetzt ein gemeinsames, referenznahes Designsystem.**
  Betriebs-App, Plattformverwaltung und VDE-Editor teilen Farben, Typografie,
  Dichte, Radien, Tabellen, Reiter, Formfelder, Statusmarken und Fokuszustände.
  Die Desktop-Oberfläche folgt dem kompakten dunklen App-Rahmen der
  Referenzbilder; mobile Touch-Ziele, Offlinebetrieb und Rollensteuerung bleiben
  erhalten.
  - **Woche und Zeiterfassung sind getrennte Bereiche.** Die Woche ergänzt die
    vorhandenen Detailbuchungen um eine echte Sieben-Tage-Tabelle mit Soll,
    Ist, Differenz, Einsatz und Status.
  - Baustellen und Mitarbeiter haben echte Aktiv-/Archiv-Reiter; Mitarbeiter
    lassen sich nach Name und Rolle filtern. Prüfprotokolle filtern nach
    Baustelle und Status, Dokumente öffnen das Uploadformular erst bei Bedarf.
  - Die neue Auswertungsansicht vergleicht die vorhandenen Jahreskonten
    tabellarisch nach Soll, Ist, Differenz, Überstunden und Saldo. Zeitraum und
    Mitarbeiter lassen sich filtern; die bestehenden PDF-/Excel-Exporte sind
    in derselben Ansicht angebunden.
  - Die Einsatzplanung besitzt echte Wochen-/Monatsreiter sowie Heute-, Druck-
    und Anlageaktionen. Login, Dashboard, Tabellen und Formulare wurden auf die
    ruhigere, kompaktere Informationsdichte der Referenz umgestellt.
- Fassung 0.43.0, Speicher `schaefchen-online-v79`, Migration 092.

- **Die Berichtsarten richten sich nach dem, was die Firma hat.**
  Montageberichte und Bautagesberichte sind zwei **getrennte Bereiche** im
  Katalog — ein Betrieb kann den einen führen und den anderen nicht. Die
  Auswahl im Bericht hat das nie gewusst und immer beide angeboten.
  - Wer den falschen nahm, merkte es **erst nach dem Speichern**: „Der Bereich
    Montageberichte ist für diese Firma abgeschaltet." Titel, ausgeführte
    Leistungen, Stunden je Mitarbeiter und ausgewählte Fotos waren dann umsonst
    eingetragen. Am schlimmsten trifft es den Monteur, der abends auf der
    Baustelle steht und den Bericht loswerden will.
  - Bleibt nur eine Art übrig, **steht sie fest da**, statt eine Entscheidung
    vorzutäuschen. Das gilt in der Baustellenakte wie auf der Feierabendkarte —
    und ein wiederhergestellter Entwurf kann keine Art zurückholen, die es
    nicht mehr gibt.
  - Dazu ein Zweites: die **Witterung** gehört zum Bautagesbericht, der Server
    verwirft sie beim Montageschein. Sichtbar blieb das Feld in der
    Baustellenakte trotzdem — man konnte es ausfüllen, und der Eintrag
    verschwand beim Speichern, ohne ein Wort. Die Feierabendkarte hat das schon
    immer richtig gemacht; die Akte jetzt auch.
- Fassung 0.42.36, Speicher `schaefchen-online-v78`, Migration 091.

- **Der Materialschalter sperrt jetzt auch die Schnittstelle.** Material war der
  einzige abschaltbare Bereich mit eigenem Bildschirm, dessen Routen **nicht am
  Modul geprüft** wurden. Abgeschaltet verschwand er aus der Oberfläche, blieb
  über die Schnittstelle aber voll bedienbar — der Schalter der
  Plattformverwaltung war dort eine reine Anzeige. Alle anderen Bereiche hatten
  ihren Wächter längst; jetzt auch das Material, beim Anlegen wie beim Ändern.
- **Projekte lassen sich wieder ändern.** Der Bearbeitungsbogen war fertig
  gebaut und die Schnittstelle nahm Änderungen an — nur **rief ihn niemand
  auf**. Ein Projekt ließ sich anlegen und danach nie wieder ändern, auch nicht
  abschließen. Die Kundenansicht führt jetzt auch die Projekte, mit demselben
  Weg hinein wie bei den Kunden.
- **Drei tote Verwaltungslisten entfernt.** Baustellen, Kunden und Projekte
  hatten je eine zweite Liste, die bei jedem Aktualisieren und bei jedem
  Tastendruck neu aufgebaut wurde, **ohne dass sie jemals jemand zu sehen
  bekam** — Reste aus der Zeit vor den heutigen Übersichten. An der laufenden
  App über alle Bereiche nachgemessen und dann entfernt.
- Fassung 0.42.35, Speicher `schaefchen-online-v77`, Migration 090.

- **Die Startseite sagt jetzt, woran sie ist.** Gemeldet als „Start lädt
  ungewöhnlich lange" — mit einem Bild, auf dem unter der Begrüßung gar nichts
  stand.
  - Kennzahlen, Tagesübersicht und Schnellzugriff hängen alle an derselben
    **Betriebsübersicht**. Ist sie nicht da, stehen alle drei auf „versteckt",
    und die Startseite ist vollständig leer. Sie sah während des Ladens genauso
    aus wie nach einem fehlgeschlagenen Laden — und ein **Netzfehler blieb
    stumm**, weil die Meldung bei Netzfehlern absichtlich unterbleibt. Wer das
    sieht, wartet: erst eine Weile, dann länger.
  - Jetzt steht dort, dass geladen wird. Dauert es **länger als acht
    Sekunden**, steht dort, dass es länger dauert als üblich und der Server
    vielleicht gerade erst anläuft — „wird geladen" stimmt nach einer halben
    Minute zwar noch, hilft aber niemandem mehr.
  - Ist es **gescheitert**, steht das da, mit einem Knopf zum erneuten
    Versuchen.
- Fassung 0.42.34, Speicher `schaefchen-online-v76`, Migration 089.

- **Die App merkt jetzt, wenn sie halb alt läuft.** Das Dokument fordert eine
  bestimmte Fassung an — `app.js?v=0.42.33`. Der Dienst-Worker darf im Notfall
  eine ältere Fassung derselben Datei zurückgeben; während einer
  Veröffentlichung ist eine Fassung zu alt besser als eine weiße Seite. Nur
  geht dieser Notfall vorbei, **ohne dass es jemand merkt**: dann läuft neues
  Gerüst mit alter Anwendung oder umgekehrt.
  - Das sieht nicht kaputt aus. Es fehlt nur etwas — eine Schaltfläche, eine
    Zahl neben einer anderen. Man sucht den Fehler dann in der Fachlichkeit,
    wo keiner ist.
  - Die angeforderte Fassung steht in der eigenen Adresse, die eingebaute im
    Quelltext. Gehen sie auseinander, räumt die App die abgelegten Dateien weg
    und lädt neu — **genau einmal**. Liefert der Server selbst noch die alte
    Datei aus, wäre ein zweiter Versuch eine Schleife; dann bleibt der
    Hinweisbalken stehen und sagt, was auseinandergeht.
  - Kleinigkeit derselben Art: neben „Resturlaub" stand als Platzhalter
    „0 Tage". Solange die Zahl nicht geladen ist, wäre jede Zahl eine
    **Behauptung über den Urlaubsanspruch eines Menschen**. Dort steht jetzt
    ein Strich.
- Fassung 0.42.33, Speicher `schaefchen-online-v75`, Migration 088.

- **Freigegebene Bereiche kommen jetzt ohne Neuladen an.** Gemeldet wurde es am
  Fuhrpark: in der Plattformverwaltung eingeschaltet, in der App trotzdem nicht
  da. Der Fehler lag nicht am Fuhrpark.
  - Die Liste der freigegebenen Bereiche kam bisher **nur beim Anmelden** mit.
    Wird danach etwas freigeschaltet, lässt der Server es sofort zu — die App
    weiß aber nichts davon und blendet den Eintrag weiter aus. Erst ein
    vollständiges Neuladen brachte ihn. Auf einem Telefon mit eingerichteter App
    passiert das tagelang nicht; dort heißt „erst nach dem Neuladen" in der
    Praxis **„gar nicht"**.
  - Die App fragt den Stand jetzt nach: **beim Zurückkommen aus dem
    Hintergrund**, beim Wiederfinden der Verbindung und alle fünf Minuten.
    Häufiger braucht es nicht — eine Freigabe muss nicht sekundengenau ankommen.
  - Es gilt in **beide Richtungen**. Wird ein Bereich abgeschaltet, während
    jemand darin steht, wird er auf die Startseite gesetzt: der Bildschirm wäre
    sonst noch da, die Schnittstelle dahinter aber schon gesperrt.
  - Bleibt die Antwort aus — offline, Serverfehler —, bleibt der bekannte Stand
    stehen. Bereiche wegzunehmen, nur weil gerade niemand antwortet, wäre
    schlimmer als eine Liste, die eine Weile alt ist.
- Fassung 0.42.32, Speicher `schaefchen-online-v74`, Migration 087.

- **Der Resturlaub steht jetzt neben den Stunden.** Auf der Übersicht stand
  bisher nur eine Zahl — der Stand des Arbeitskontos. Der Resturlaub lag im
  Wochenbereich, einen Bereichswechsel entfernt.
  - Beide Zahlen beantworten dieselbe Frage: **was steht mir noch zu.** Wer die
    eine ansieht, will meist auch die andere wissen. Sie stehen jetzt
    nebeneinander in derselben Karte.
  - Zwei **gleich breite Spalten**, nicht „so breit wie nötig”: sonst wandert
    die zweite Zahl mit jeder Stelle, die die erste dazugewinnt, und die Karte
    sieht bei jedem Blick anders aus.
  - Die Karte steht ab jetzt **auch bei deaktiviertem Stundenkonto** da — dann
    mit „Deaktiviert” statt der Stunden. Der Urlaub läuft davon unabhängig
    weiter; der Wochenbereich sagt das schon ausdrücklich, und die Übersicht
    hat ihm bisher widersprochen, indem sie die ganze Karte wegließ.
- Fassung 0.42.31, Speicher `schaefchen-online-v73`, Migration 086.

- **„Baustelle öffnen” funktioniert wieder von überall.** In der
  Berichtszentrale, unter „Fehlende Pflichtberichte“, tat der Knopf nichts
  Sichtbares.
  - Die Akte einer Baustelle liegt im Bereich **Baustellen**. Solange es nur
    einen Bereich gab, war das keine Frage. Seit die Berichtszentrale, die
    Suche und das Dashboard eigene Bereiche sind, muss der Bereich beim Öffnen
    mitwechseln — sonst geht die Akte auf, aber in einem Bereich, den man
    gerade nicht ansieht.
  - Der Wechsel steht jetzt **in der Funktion, die die Akte öffnet**, und nicht
    mehr bei jedem Aufrufer. Genau daran lag es: die Aufrufer mussten es selbst
    tun, und einer hatte es nicht. So kann es keiner mehr vergessen. Alle fünf
    Wege in die Akte — Baustellenliste, Suche, Dashboard, fehlender
    Pflichtbericht, Bericht — sind nachgemessen.
  - Dazu eine Kleinigkeit derselben Art: die Akte scrollte so weit hoch, dass
    **ihr eigener Name unter der Kopfzeile verschwand**. Man sah die geöffnete
    Baustelle, aber nicht, welche es ist.
- Fassung 0.42.30, Speicher `schaefchen-online-v72`, Migration 085.

- **Die App sagt jetzt, wenn sie veraltet ist.** Ein Telefon mit eingerichteter
  App konnte tagelang eine alte Oberfläche zeigen: der Dienst-Worker täuscht
  dabei eine funktionierende Welt vor, und niemand erfährt, dass es eine neuere
  gibt.
  - Jede Antwort des Servers nennt jetzt **seine Fassung**. Die App vergleicht
    sie mit ihrer eigenen und bietet oben das Neuladen an — und zwingt
    niemanden: mitten in einer Eingabe neu zu laden wäre schlimmer als eine
    alte Oberfläche.
  - „Jetzt neu laden“ wirft dabei die alten Dateien weg. Ein bloßes Neuladen
    holte bei einer eingerichteten App wieder dieselben aus dem Speicher.
  - Der Vergleich geschieht **zahlenweise**. Als Zeichenketten wäre „0.42.9“
    größer als „0.42.28“, und der Hinweis bliebe genau dann aus, wenn er
    gebraucht wird.
- **Die untere Leiste am Telefon trägt sechs Einträge.** Mit den Namen aus dem
  Entwurf wurde sie eng: „Einsatzplanung“ ist dreimal so breit wie „Azubi“.
  Unten steht deshalb die kurze Beschriftung — **Start, Baustellen, Planung,
  Zeiten, Azubi, Mehr**. Der lange Name bleibt im Dokument stehen: er ist der
  Name des Bereichs, den ein Vorleser nennt, und er steht am Rechner in der
  Seitenleiste.
- Fassung 0.42.29, Speicher `schaefchen-online-v71`, Migration 084.

- **Der Fuhrpark.** Das Modul stand seit Migration 040 im Katalog, dahinter lag
  nichts — es war als „noch nicht angebunden“ geführt und ließ sich gar nicht
  einschalten. Jetzt gibt es die Fahrzeuge wirklich: **Kennzeichen,
  Bezeichnung, Art, benötigte Führerscheinklasse, fester Fahrer, Zustand,
  nächste HU und nächster Service.**
  - Eine **abgelaufene Hauptuntersuchung** ist kein Termin mehr, sondern ein
    Fahrverbot. Sie steht rot in der Liste.
  - Das Kennzeichen ist je Firma nur einmal vergeben, **auch anders
    geschrieben**: „ES-SE 123“ und „es-se123“ sind derselbe Wagen. Gespeichert
    wird eine Schreibweise.
  - Ein ausgemustertes Fahrzeug wird **nicht gelöscht** — es steht in alten
    Berichten. Die Schnittstelle darf gar nicht löschen.
  - Der Fuhrpark gehört ab jetzt zum **Standardumfang**, dorthin, wo Dokumente
    und Material schon stehen. Bestandsfirmen bekommen ihn nachträglich.
- Fassung 0.42.28, Speicher `schaefchen-online-v70`, Migrationen 081 bis 083.

- **Suche und Glocke in der Kopfzeile.** Beide standen im Entwurf und fehlten
  bisher mit Absicht — ein Bedienelement, das nichts tut, ist schlechter als
  keines. Jetzt tun sie etwas.
  - Die **Suche** durchsucht Baustellen, Kunden, Mitarbeiter und Berichte und
    springt in den passenden Bereich. Sie arbeitet mit dem, was ohnehin geladen
    ist: eine Suche, die etwas findet, was der Bildschirm daneben nicht kennt,
    wäre schlimmer als keine.
  - Die **Glocke** zählt, was jemand *tun* muss, nicht was passiert ist:
    Berichte zur Freigabe, Zeitkorrekturen zur Prüfung, offene
    Abwesenheitsanträge, Berichtsheft-Wochen zum Abzeichnen und Baustellen, die
    der Monteur angelegt hat und die das Büro bestätigen muss. Eine Meldung,
    die niemanden zu etwas auffordert, ist eine Ablenkung.
  - Beides gilt **nur für die Planung** — ein Monteur hat weder etwas
    freizugeben noch einen Betrieb zu durchsuchen.
  - Am Telefon ist in der Kopfzeile kein Platz dafür; dort führt der Weg über
    die Bereiche selbst, die jeweils ihr eigenes Suchfeld haben.
- Fassung 0.42.27, Speicher `schaefchen-online-v69`, Migration 080.

- **Führerschein am Mitarbeiter, und die Einsatzplanung warnt.** Auf einer
  Baustelle, auf der niemand mit Führerschein eingeteilt ist, steht am Morgen
  das Fahrzeug in der Halle und die Mannschaft am Betriebshof. Das fiel bisher
  erst auf, wenn es zu spät war.
  - Die **Disposition sagt es beim Planen**: welche Baustellen des Tages ohne
    Fahrer dastehen und wie viele Leute dort sind.
  - Ist bei **niemandem** ein Schein hinterlegt, sagt der Hinweis das getrennt
    — dann ist nicht die Planung falsch, sondern die Stammdaten sind
    unvollständig, und niemand soll das eine für das andere halten.
  - Die Klassen sind die des deutschen Führerscheins als **feste Liste** mit
    Erklärung daneben („C1E · Lkw bis 7,5 t mit Anhänger“). „Klasse 3“ und „B“
    wären sonst zwei verschiedene Dinge, und keine Auswertung würde beide
    finden. Kleinschreibung, Leerzeichen und Dopplungen räumt der Bestand
    selbst auf.
  - Gepflegt wird beim Anlegen und Bearbeiten, angezeigt in der
    Mitarbeiterspalte.
- Fassung 0.42.26, Speicher `schaefchen-online-v68`, Migrationen 078 und 079.

- **Neues Design, achter Schritt: Wochenstreifen und Mitarbeiterliste.**
  - Der **Wochenstreifen** zeigte bisher nur Wochentag und Tageszahl. Wer
    wissen wollte, wann er am Dienstag angefangen hat, musste den Tag
    anklicken. Jetzt trägt jeder Tag seine Zahlen selbst: **Wochentag, Datum,
    grüner Haken, Kommen, Gehen, Stunden**. Wer den Streifen überfliegt, sieht
    ohne Klick, wo etwas fehlt.
  - Der heutige Tag ist **rot umrandet statt rot gefüllt** — gefüllt zog er
    alle Aufmerksamkeit auf sich, und die Zahlen darin wären gegen Rot
    schlechter zu lesen.
  - **Am Telefon passen alle sieben Tage nebeneinander.** Vorher scrollte der
    Streifen und der Sonntag war halb abgeschnitten, was aussieht wie ein
    Fehler.
  - Über dem Streifen steht die **Kalenderwoche zwischen den Pfeilen**, daneben
    der Zeitraum und der Sprung auf „Heute“ — die Reihenfolge des Entwurfs.
  - Die **Mitarbeiterliste** trägt das Kürzel vor dem Namen, den **Saldo des
    Monats** als eigene Spalte und eine Statusmarke. Rechts daneben steht die
    **Spalte des Ausgewählten** mit Rolle, Personalnummer, Mail, Telefon und
    Saldo. Der Saldo kommt aus dem Jahreskonto — dieselbe Zahl, die die
    Büroverwaltung unter „Jahreskonten“ auflistet.
  - **Noch nicht enthalten:** ein echtes Foto (es gibt keins — ein erfundener
    Kopf wäre schlimmer als zwei Buchstaben) und die *Qualifikationen* aus dem
    Entwurf: dafür gibt es im Datenbestand noch kein Feld.
- Fassung 0.42.25, Speicher `schaefchen-online-v67`, Migration 077.

- **Neues Design, siebter Schritt: Büro-Dashboard und Baustellenakte.**
  - Wer plant, sitzt im Büro: sein Dashboard **endet jetzt nach „Heute im
    Überblick“** — genau da, wo es im Entwurf endet. Arbeitstag, heutiger
    Einsatz, Übersichtskarten und Stundenzettel stehen bei ihm in der
    Zeiterfassung; dort sucht er sie ohnehin. **Monteur, Vorarbeiter und
    Auszubildender behalten ihr Dashboard unverändert** — sie haben keine
    Kennzahlen und brauchen den Startknopf beim Aufmachen der App.
  - Die **Baustellenakte** trägt „Baustelle ausgewählt“ über dem Namen, die
    Reiterleiste ist am Rechner ein Strich statt Pillen, und die Übersicht
    zeigt die vier Felder des Entwurfs: **Adresse, Vorarbeiter, wer heute vor
    Ort ist** (als Kürzel-Zeichen, ab dem vierten eine rote Marke mit der
    Restzahl) **und wann es weitergeht** („Heute, 07:00“ / „Morgen, 07:30“).
    Alle vier Angaben standen schon in den Daten — sie standen nur nirgends
    beieinander.
  - Am Telefon bleiben die Reiter Pillen: dort scrollt die Leiste waagerecht,
    und eine Pille trifft der Daumen besser als eine Beschriftung.
- Fassung 0.42.24, Speicher `schaefchen-online-v66`, Migration 076.

- **Neues Design, sechster Schritt: das Dashboard.** Begrüßung mit Namen und
  Winkhand, darunter das volle Datum, rechts der Schnellzugriff. Dann **vier
  Kennzahlen** nebeneinander — laufende Baustellen, Mitarbeiter im Einsatz,
  offene Berichte, Überstunden der Woche — und darunter **„Heute im
  Überblick“** mit zwei Feldern: die Baustellen, auf denen heute jemand steht,
  und was zuletzt im Betrieb passiert ist.
  - Die Kennzahlen gelten **nur für die Planung**. Ein Monteur oder Vorarbeiter
    sieht auf seinem Dashboard weiterhin den Arbeitstag; mit der Zahl der
    laufenden Baustellen des ganzen Betriebs kann er nichts anfangen.
  - Gezählt wird nur, was ohnehin geladen ist — eine eigene Abfrage wäre eine
    zweite Quelle für dieselben Zahlen. Die Überstunden kommen aus der
    Wochenansicht selbst: dieselbe Rechnung zweimal aufzuschreiben ist die
    sicherste Art, zwei verschiedene Zahlen zu bekommen.
  - Der **Schnellzugriff** führt nur zu Dingen, die es wirklich gibt —
    Baustelle, Einsatz, Mitarbeiter, Kunde. Jeder Eintrag öffnet den Bereich
    und klappt dort das Formular auf.
  - **Nicht enthalten:** die Glocke und die Suche aus dem Entwurf. Ein
    Bedienelement, das nichts tut, ist schlechter als keines.
- Fassung 0.42.23, Speicher `schaefchen-online-v65`, Migration 075.

- **Neues Design, fünfter Schritt: die Seitenleiste mit allen Bereichen.**
  Bisher führte die Leiste fünf Einträge, und dahinter lagen drei Bildschirme.
  Unter „Mehr“ stand alles andere untereinander — Mitarbeiter, Jahreskonten,
  Feiertage, Zugang. Wer die Mitarbeiterliste wollte, scrollte an drei Tafeln
  vorbei.
  - Jeder Eintrag hat jetzt seinen **eigenen Bereich**: Dashboard, Baustellen,
    Einsatzplanung, Zeiterfassung, Berichte, Prüfprotokolle, Azubi,
    Mitarbeiter, Kunden, Dokumente, Einstellungen. Die Tafeln sind dieselben,
    sie sind umgezogen. Oben steht das Zeichen mit der Wortmarke.
  - **Neu, weil es sie noch nicht gab:** *Kunden* mit Nummer, Ansprechpartner,
    Projekten und laufenden Baustellen; *Prüfprotokolle* mit allen
    VDE-Prüfungen des Betriebs — bisher waren die nur in der Akte der
    einzelnen Baustelle zu finden.
  - **Nicht enthalten:** die Spalte „Offene Rechnungen“ bei den Kunden (es
    gibt keine Rechnungsstellung in Schäfchen) und die Einträge *Material* und
    *Fahrzeuge* (dahinter liegt noch kein Bildschirm). Erfundene Beträge und
    Einträge, die nichts öffnen, sind schlechter als keine.
  - **Am Telefon** fasst die untere Leiste weiterhin fünf Einträge. Die
    übrigen Bereiche stehen unter „Einstellungen“ als Liste — sie entsteht aus
    denselben Schaltflächen wie die Leiste und kann nicht auseinanderlaufen.
- Fassung 0.42.22, Speicher `schaefchen-online-v64`, Migration 074.

- **Neues Design, vierter Schritt: die Anmeldeseite.** Am Rechner steht sie
  jetzt zweispaltig da wie im Entwurf: links dunkel mit Name und Anspruch,
  rechts das Formular. **Am Telefon bleibt die einspaltige Karte** — dort ist
  für eine zweite Spalte kein Platz, und die Karte ist erprobt.
  - Die dunkle Seite steht im Dokument **hinter** dem Formular und wird nur
    nach links gesetzt. Wer mit Tastatur oder Vorleser ankommt, landet dadurch
    zuerst bei der Anmeldung und nicht bei den Werbezeilen.
  - Der Name der App steht am Rechner nur noch links. Zweimal „Schäfchen“
    nebeneinander wäre eine Dopplung — dieselbe Überlegung wie bei
    Seitenleiste und Kopfzeile.
  - Der Passwortwechsel ist ein eigener Bereich und bleibt mittig; die
    Ersteinrichtung nutzt dieselbe rechte Spalte wie die Anmeldung.
- Fassung 0.42.21, Speicher `schaefchen-online-v63`, Migration 073.

- **Neues Design, dritter Schritt: die Übersicht.** Arbeitskonto, offene
  Hinweise und der nächste Feiertag standen im Wochenbereich. Wer morgens die
  App aufmacht, will genau diese drei Angaben sehen, ohne den Bereich zu
  wechseln — deshalb stehen sie jetzt auf der Startseite, unter dem Arbeitstag
  und dem heutigen Einsatz. Am Rechner nebeneinander, am Handy gestapelt.
  - Sie sind **nicht doppelt**: die Karten sind dieselben, sie sind umgezogen.
    Nur der Stand des Arbeitskontos steht zweimal da — auf der Übersicht als
    eine Zahl mit „Zur Woche“ daneben, im Wochenbereich mit den Monatswerten
    darunter. Eine Zahl ist keine Aufschlüsselung.
  - Die Reihe steht nur da, wenn wenigstens eine Karte etwas zu sagen hat.
    Fällt eine weg — kein offener Hinweis, kein Feiertag mehr im Jahr —,
    teilen sich die übrigen die Breite, statt eine Lücke zu lassen.
  - **Die Begrüßung folgt jetzt der Uhrzeit.** „Guten Morgen“ stand bisher zu
    jeder Uhrzeit da; auf einer Baustelle wird auch nachmittags und nachts
    gearbeitet. Die Grenzen sind großzügig gesetzt: die Frühschicht um sechs
    liest „Guten Morgen“, die Spätschicht nach achtzehn Uhr „Guten Abend“.
- Fassung 0.42.20, Speicher `schaefchen-online-v62`, Migration 072.

- **Neues Design, zweiter Schritt: Listen werden am Rechner zu Tabellen.**
  Mitarbeiter und Baustellen standen bisher auch auf 1440 Pixeln so da wie auf
  dem Telefon: Name fett, darunter alle Angaben in einer Zeile mit
  Mittelpunkten dazwischen. Wer zwölf Mitarbeiter nach einer Telefonnummer
  durchsucht, muss dabei jede Zeile lesen. Jetzt steht am Rechner eine
  **Kopfzeile** darüber und jede Angabe in **ihrer Spalte** — man fährt die
  Spalte mit den Augen ab und ist fertig.
  - **Mitarbeiter:** Name, Personalnummer, Rolle, Telefon, E-Mail.
  - **Baustellen:** Baustelle, Kunde, Adresse, Auftrag, Dokumente, Status.
    Die Liste bekommt dafür die volle Breite; sie stand in einer 511 Pixel
    schmalen Spalte neben der Berichtszentrale, in der eine Tabelle nur
    abgeschnitten hätte werden können. Suchen, Status und „Baustelle anlegen“
    stehen jetzt in einer Zeile über der Tabelle.
  - Kopfzeile und Datenzeilen lesen **dieselbe** Spaltenangabe, damit sie nicht
    auseinanderlaufen können. Die Spalte für „Bearbeiten“ beziehungsweise
    „Öffnen“ ist fest breit: wäre sie automatisch breit, hätten Zeilen ohne
    Schaltfläche dort null Pixel, und alle übrigen Spalten würden gegenüber der
    Kopfzeile verrutschen. Genau das war beim ersten Anlauf zu sehen.
  - **Auf dem Telefon bleibt alles, wie es war:** dieselben Angaben gestapelt
    unter dem Namen, leere Angaben fallen weg statt als „–“ dazustehen, und die
    Statusmarke bekommt eine eigene Zeile statt eines Mittelpunkts davor.
  - Eine vom Monteur angelegte Baustelle trägt ihre offene Büroprüfung jetzt
    als **gelbe Marke** in der Statusspalte.
- Fassung 0.42.19, Speicher `schaefchen-online-v61`, Migration 071.

- **Neues Design, erster Schritt: der Rahmen.** Nach dem Gesamtentwurf bekommt
  Schäfchen am Rechner eine **dunkle Seitenleiste** mit rotem aktivem Eintrag
  und dem Namen der App darüber, dazu **Benutzername und Rolle in der
  Kopfzeile**. Firmenzeichen und -name bleiben links in der Kopfzeile; der
  App-Name steht nur noch einmal, in der Leiste.
  - Die Beschriftungen folgen dem Entwurf: „Übersicht“, „Einsatzplanung“,
    „Azubi-Berichtsheft“.
  - Jeder Bildschirm erbt diesen Rahmen — deshalb kommt er zuerst.
  - **Auf dem Telefon ändert sich nichts** außer den Beschriftungen. Dort ist
    die helle Leiste unten am Rand richtig und erprobt.
  - Noch nicht enthalten und bewusst nicht vorgetäuscht: das Suchfeld und die
    Glocke aus dem Entwurf. Ein Bedienelement, das nichts tut, ist schlechter
    als keines. Ebenso fehlen die Einträge der Leiste, hinter denen noch kein
    Bildschirm liegt (Material, Fahrzeuge, Dokumente, Auswertungen).
- Fassung 0.42.18, Speicher `schaefchen-online-v60`, Migration 070.

- **Der Berichtsheft-Bildschirm nach der Vorlage.** Kopfdaten wie im gedruckten
  Blatt (Azubi, Lehrjahr, Ausbildungsberuf, Intervall), eine Tagestabelle mit
  denselben vier Spalten — Tag, Datum, Tätigkeiten, Arbeitszeit —, ein
  Zeichenzähler an den Bemerkungen, der Stand der Woche („3 von 5 Tagen
  ausgefüllt“) und die Regeln dort, wo geschrieben wird: als drei Karten unter
  dem Formular statt in einer Anleitung, die niemand aufschlägt.
  - Am Handy stehen Tag und Zeit in einer Kopfzeile und das Feld darunter, am
    Rechner nebeneinander wie eine Tabellenzeile. Dieselben Bausteine.
  - Das **Lehrjahr** wird auch am Bildschirm aus dem Ausbildungsbeginn
    gerechnet. Fehlt der Ausbildungsberuf, steht das jetzt dort — vorher fiel
    es erst der Kammer auf.
- **Vorschau des Wochenblatts neben dem Formular.** Sie ist etwas anderes als
  ein Ausdruck: für einen Entwurf erlaubt, dafür mit „VORSCHAU“ quer über dem
  Blatt, einem entsprechenden Fußtext und dem Wort im Dateinamen. Sie wird im
  Browser angezeigt statt in den Downloadordner gelegt.
  - Dabei kam die eigene Sicherheitsrichtlinie in die Quere: `frame-ancestors
    'none'` verbot das Einrahmen — auch durch die App selbst. Gelockert wird
    das **nur für diese eine Antwort** und nur auf `'self'`; fremde Seiten
    können Schäfchen weiterhin nicht einrahmen, und für alle übrigen Antworten
    bleibt es bei `'none'`.
  - Am Handy gibt es die Vorschau nicht daneben, sondern über eine
    Schaltfläche in einem eigenen Fenster — ein eingebettetes A4-Blatt nimmt
    dort mehr Platz weg, als es hilft.
- Fassung 0.42.17, Speicher `schaefchen-online-v59`, Migration 069.

- **Schäfchen bekommt eine Desktop-Gestalt.** Gebaut ist die App für die
  Baustelle: eine Spalte, Daumenbedienung, Navigation unten. Am Rechner sitzt
  aber das Büro — Einsatzplanung, Baustellen, Stundenzettel prüfen. Dort galt
  bisher dieselbe schmale Spalte: von 1440 Pixeln Breite war **die Hälfte
  genutzt**, und die Plantafel zeigte **drei von fünf Wochentagen**, den Rest
  hinter einem Schiebebalken — obwohl die ganze Woche zweimal hingepasst hätte.
  - Ab **1080 Pixeln** wandert die Navigation nach **links** und bleibt beim
    Blättern stehen. Sie nimmt keine Höhe weg; die Plantafel zeigt seitdem alle
    Wochentage ohne Schiebebalken.
  - Der Inhalt nutzt die Breite bis höchstens 1360 Pixel. Breiter wird kein
    Text besser lesbar.
  - Karten, die fachlich zusammengehören, stehen nebeneinander: Arbeitstag und
    heutiger Einsatz, Arbeitskonto und Abwesenheit, Berichtszentrale und
    Baustellenplanung. Im Berichtsheft stehen die Tagesfelder zu zweit und der
    Verlauf daneben — ein Eingabefeld über 1000 Pixel für „Steckdosen gesetzt“
    war kein Gewinn.
  - Formulare bleiben schmal. Ein Namensfeld über die halbe Bildschirmbreite
    lädt niemanden zum Ausfüllen ein.
  - Die Bereiche werden dabei **benannt platziert**, nicht automatisch
    umgebrochen: nichts soll an einer Stelle landen, an der es keinen Sinn
    ergibt.
  - **Am Aufbau der Seite ändert sich nichts** — keine zweite Fassung, kein
    Umschalter, dieselben Bausteine ordnen sich anders an. Die Handy-Ansicht
    ist unberührt; nachgemessen bei 390, 768, 1023 und 1079 Pixeln.
  - Geprüft an sieben Breiten von 390 bis 1920 Pixeln und in allen Bereichen
    als Büro, Auszubildender und Monteur: nirgends ein waagerechter
    Schiebebalken. Die Wochenansicht ist von 2645 auf 1984 Pixel Höhe
    geschrumpft, die Baustellenplanung von 1372 auf 986 — sie passt jetzt auf
    einen Bildschirm.
- Fassung 0.42.16, Speicher `schaefchen-online-v58`, Migration 068.

- **Aus dem Viewer-Durchgang: die Mängelliste im VDE-Protokoll war zerrissen.**
  Auf dem Deckblatt ist bei fünf Zeilen Schluss, damit Ergebnis und
  Unterschriften darauf Platz behalten. Der Rest stand danach **hinter den
  Messwerten** — wer das Protokoll las, fand mitten zwischen Ohm-Werten eine
  „Fortsetzung“ der Mängel von Seite 1. Bei einem Prüfprotokoll sind die
  Mängel das, was zählt; sie stehen jetzt unmittelbar hinter dem Deckblatt und
  vor den Messwerten. Ein Test hält die Reihenfolge fest.
  - Gefunden hat das kein Test, sondern ein Blick in den PDF-Betrachter des
    Telefons. Die Messung prüft, ob etwas neben dem Blatt liegt — dass eine
    Rubrik durch eine andere unterbrochen wird, sieht nur ein Mensch.
- Fassung 0.42.15, Speicher `schaefchen-online-v57`, Migration 067.

- **Alle vier PDF-Arten werden jetzt nachgemessen, nicht nur gezählt.** Beim
  Berichtsheft war ein Fehler aufgefallen, den die Seitenzahl nicht sieht: der
  Inhalt lief unten aus dem Blatt heraus, und das PDF hatte trotzdem „eine
  Seite“ — pdf-lib zählt Inhalt außerhalb der Seite mit, das Papier zeigt ihn
  nicht. Dieselbe Messung fehlte für Montageschein, Stundenzettel und
  VDE-Protokoll.
  - Die Messung liegt jetzt als gemeinsames Testwerkzeug
    (`api/tests/helpers/pdf-messen.mjs`) vor: sie liest den Inhaltsstrom jeder
    Seite und sagt, wohin gezeichnet wurde und welcher Text dort steht.
  - Geprüft mit harten Fällen: 120 Zeilen Bericht, 40 Mitarbeiter auf einem
    Montageschein, drei Jahre Stundenzettel am Stück, eine Gewerbeanlage mit
    4 Verteilungen × 6 FI × 8 Stromkreisen, sehr lange Bezeichnungen aus dem
    Feld und eine Mängelliste über 60 Einträge.
  - **Ergebnis: kein Fehler.** Die drei anderen PDFs halten alles auf dem
    Blatt und kürzen nichts stillschweigend — der Fehler im Berichtsheft war
    seiner festen Fußzeile geschuldet, kein durchgehendes Muster.
  - Dass die neuen Tests nicht hohl sind, ist gegengeprüft: mit ausgehebeltem
    Seitenumbruch beziehungsweise verschobenem Rand fallen sie um.
  - Damit ist die Erzeugungsseite von Release-Gate #21 abgedeckt. Die Prüfung
    **in den Ziel-Viewern** steht weiter aus — die braucht einen Menschen vor
    Acrobat, Vorschau und dem PDF-Betrachter des Telefons.

- **Der große Integrationstest läuft wiederholt gegen dieselbe Datenbank.**
  Bisher setzte er eine leere voraus, sagte das aber nirgends: ein zweiter Lauf
  ohne Neuaufbau scheiterte mit sechzehn Fehlern auf einmal, und wer das sah,
  suchte den Fehler in seiner eigenen Änderung statt im Zustand der Datenbank.
  Drei Ursachen, alle vom selben Muster — fest verdrahtete Annahmen über die
  Startdaten:
  - Er richtete die **mitgelieferte Firma F-000001** ein und setzte damit
    voraus, dass sie noch keinen Benutzer hat. Er bringt jetzt seine eigene
    Firma mit; der geprüfte Weg der Ersteinrichtung bleibt derselbe.
  - Er las den **Feiertagskalender** als gegeben, weil er in den Startdaten auf
    Sachsen stand. Er richtet ihn jetzt selbst ein — geprüft wird das Verhalten
    der Schnittstelle, nicht der Inhalt der Startdaten.
  - Er legte eine **feste Fassungsnummer** (`0.43.0`) an und lief beim zweiten
    Mal in einen Schlüsselkonflikt, den die Schnittstelle nur als
    `internal_error` meldete. Die Nummer trägt jetzt den Lauf im Namen.
  - Die **Plattformverwaltung** wird einmal je Installation eingerichtet, nicht
    je Firma — die kann sich der Test nicht mitbringen. Beim ersten Lauf geht
    er den Weg der Ersteinrichtung, danach legt er sein Konto unmittelbar an;
    in beiden Fällen prüft er, dass ein zweiter Aufruf abgewiesen wird.
  - Nachgewiesen mit drei Läufen hintereinander ohne Neuaufbau, danach zwei
    vollständigen Läufen der gesamten Schnittstellenprüfung.
  - `AGENTS.md` hält die Regel jetzt fest.

- **Nachlese zum Berichtsheft-Bereich.** Die App wurde als Ganzes durchgemessen
  — sechs Rollen, alle Bereiche, jeweils auf waagerechtes Überlaufen, doppelte
  oder leere Überschriften, stumme Schaltflächen und Konsolenfehler geprüft.
  Gefunden wurden drei Dinge, alle im Bereich des Ausbilders:
  - Der **Wochenwechsler stand da und tat nichts** — ein Ausbilder hat kein
    eigenes Heft. Er erscheint jetzt nur beim Auszubildenden.
  - **„Keine Wochenberichte vorhanden“ widersprach der Zeile darüber**, die
    offene Wochen nannte. In dieser Liste stehen nur eingereichte Wochen; sie
    sagt das jetzt auch.
  - Der Weg zum **gedruckten Heft eines ganzen Jahres war für den Ausbilder
    nicht erreichbar**. Die Schnittstelle dafür gab es bereits samt Test, nur
    keine Schaltfläche. Er sieht jetzt seine Auszubildenden mit ihrem Stand
    („2 Wochen offen“ oder „Alle Wochen abgegeben“) und druckt das Jahr je
    Person.
- Fassung 0.42.14, Speicher `schaefchen-online-v56`, Migration 066.

- **Das Berichtsheft bekommt einen eigenen Bereich.** Bisher lag es unten in
  der Wochenansicht, zwischen Stundenzettel und Abwesenheiten. Für den
  Auszubildenden ist es aber die Arbeit, die er täglich neben der
  Zeiterfassung hat, und für den Ausbilder die, die er wöchentlich abzeichnet
  — kein Anhängsel.
  - Der Bereich heißt **„Nachweis“** und erscheint nur bei diesen beiden.
  - Er enthält die Woche mit ihren Tageszeilen samt eigenem Wochenwechsel, die
    fehlenden Wochen und **alle bisherigen Berichte**. Jede Zeile dort führt in
    ihre Woche zurück und lässt sich von dort drucken; vorher war die Liste
    eine tote Aufzählung. Für den Ausbilder steht dort seine Prüfliste.
  - Die angezeigte Woche ist dieselbe wie im Stundenzettel: zwei getrennte
    Wochenstände in einer App wären für niemanden nachvollziehbar.
  - Die Navigationsleiste richtet sich jetzt nach den sichtbaren
    Schaltflächen. Die Spaltenzahl war fest verdrahtet (drei, für die Planung
    fünf) und wäre mit jedem neuen Bereich falsch geworden.
- Fassung 0.42.13, Speicher `schaefchen-online-v55`, Migration 065.

- **Eine eingereichte Woche lässt sich zurückholen.** Zu erklären, warum die
  Felder gesperrt sind, war nur die halbe Antwort: wer zu früh eingereicht
  hatte, saß fest — schreiben ging nicht mehr, und der einzige Weg zurück
  führte über den Ausbilder. Solange der nicht unterschrieben hat, gehört der
  Bericht aber dem Auszubildenden; im Papierheft streicht man vor seiner
  Unterschrift ebenso einfach durch. „Wieder bearbeiten“ nimmt die eigene
  Unterschrift zurück, die geschriebenen Tage bleiben stehen. Ein
  freigegebener Nachweis bleibt unverändert — dort steht die Unterschrift des
  Ausbilders. Beide Schritte stehen im Verlauf.
- Fassung 0.42.12, Speicher `schaefchen-online-v54`, Migration 064.

- **Zwei gemeldete Fehler im Berichtsheft behoben.**
  - **„Man kann nicht schreiben."** Nach dem Einreichen sind die Felder
    gesperrt — das ist der Sinn der Unterschrift. Auf dem Bildschirm stand dazu
    aber nichts: die Felder waren stumm, die Schaltflächen fort, und das Heft
    sah schlicht kaputt aus. Jetzt steht dort, warum und was zu tun ist:
    „Eingereicht am … Zum Ändern muss dein Ausbilder die Woche zurückgeben.“
    Eine Sperre, die sich nicht erklärt, ist ein Fehler.
  - **Eine halb ausgefüllte Woche ließ sich einreichen und drucken.** Ein Tag
    mit Arbeitszeit, aber ohne eine einzige Zeile, ergibt im Ausdruck eine
    leere Zeile neben „07:45 h“ — und das fällt erst am Ende der Ausbildung
    auf, wenn sich die Woche nicht mehr rekonstruieren lässt. Jeder Arbeitstag
    braucht jetzt eine Zeile; ein Tag mit Abwesenheit ist durch die
    Abwesenheit erklärt. Die App nennt beim Schreiben die offenen Tage,
    markiert sie und sperrt „Einreichen“ so lange. Der Server weist eine
    unvollständige Woche ebenfalls ab — die Oberfläche ist der bequeme Weg,
    nicht die Absicherung.
  - **Ein Entwurf wird nicht mehr gedruckt.** Auf Papier sieht er fertig aus
    und ist es nicht. Gedruckt wird, was eingereicht oder freigegeben ist —
    das gilt für die einzelne Woche wie für das Jahresheft.
- Fassung 0.42.11, Speicher `schaefchen-online-v53`, Migration 063.

- **Fehlende Wochen werden angemahnt.** Am Ende der Ausbildung ist eine Lücke
  im Berichtsheft teuer, und bis dahin fällt sie niemandem auf.
  - Eine Woche gilt als fällig, sobald in ihr **gearbeitet wurde oder eine
    genehmigte Abwesenheit lag**. Wochen ohne beides sind keine Lücke — vor dem
    Ausbildungsbeginn oder im Betriebsurlaub hat niemand etwas versäumt.
  - Offen bleibt sie, bis ein Bericht **eingereicht** ist. Ein Entwurf zählt
    nicht: geschrieben ist nicht abgegeben. Die laufende Woche wird nie
    angemahnt, sie ist noch nicht vorbei.
  - Der Auszubildende sieht seine Lücken über dem Wochenformular, mit einem Weg
    direkt in die betreffende Woche. Der Ausbilder sieht sie über alle seine
    Auszubildenden — ein Bericht, den niemand abgibt, fällt in einer Liste
    eingereichter Berichte sonst nicht auf.
- **Ein ganzer Zeitraum am Stück ausdruckbar**, eine Datei mit einer Seite je
  Woche. Am Ende der Ausbildung sind das gut hundertfünfzig Blätter; sie Woche
  für Woche einzeln zu laden und von Hand zu heften ist genau die Arbeit, die
  diese App abnehmen soll. Das Lehrjahr wird dabei je Woche gerechnet — ein
  Heft über zwei Lehrjahre trüge sonst auf allen Blättern dasselbe.
- Fassung 0.42.10, Speicher `schaefchen-online-v52`, Migration 062.

- **Das Berichtsheft wird täglich geschrieben und wöchentlich ausgedruckt.**
  Der Wochentext ist entfallen — er sagte nicht, an welchem Tag was war, und
  genau das will die Kammer sehen.
  - Eine **Zeile je Tag**: Tag, Datum, Tätigkeiten, Arbeitszeit. Montag bis
    Freitag stehen immer da; Samstag und Sonntag nur, wenn an ihnen etwas war.
    Dazu die „Bemerkungen zur Woche“ der Vorlage.
  - **Wochenbericht als A4-PDF**, eine Seite je Woche: Logo, Kopfdaten mit
    Lehrjahr und Ausbildungsberuf, Tagestabelle, Bemerkungen und beide
    Unterschriften mit Namen und Datum. Das Lehrjahr rechnet sich aus dem
    Ausbildungsbeginn aus — von Hand gepflegt wäre es spätestens im zweiten
    Jahr falsch.
  - Die Seite passt sich an: die Tabelle verkleinert ihre Schrift, bis die
    Woche auf das Blatt passt. Erst wenn selbst die kleinste noch lesbare
    Schrift nicht reicht, kommt ein zweites Blatt. Geschriebenes abzuschneiden
    wäre der schlechtere Handel — der Nachweis wäre unvollständig.
  - Gefunden und behoben, bevor es jemand ausgedruckt hätte: die Tabelle wuchs
    mit dem Text und schob Bemerkungen und Unterschriften unter den Blattrand.
    Das PDF hatte trotzdem genau eine Seite, auf dem Papier fehlte die halbe
    Woche. Der Test misst jetzt nach, wo tatsächlich gezeichnet wird.
- **Das Berichtsheft kommt zum Feierabend.** Es lag allein im Wochenbereich —
  dort sucht am Feierabend niemand danach, und wer erst am Freitag anfängt,
  weiß den Montag nicht mehr. Wer als Auszubildender Feierabend stempelt, wird
  jetzt gefragt, was er heute gemacht hat; die Zeitbuchung wartet dabei auf
  nichts. Auf der Startseite steht das Heft außerdem als eigene Karte, direkt
  unter dem Arbeitstag.
- Zwei Anzeigefehler behoben:
  - Ein Auszubildender las in seinem eigenen Konto **„Monteur“**. Die
    Rollenbezeichnung kannte die neue Rolle nicht und fiel auf den Monteur
    zurück — in der Planung ebenso.
  - Die **Konto-Karte stand nach jeder Anmeldung auch auf der Startseite**. Der
    Bereichswechsel hatte sie richtig verborgen, das spätere Zeichnen holte sie
    wieder hervor.
- Fassung 0.42.9, Speicher `schaefchen-online-v51`, Migrationen 060 und 061.

- Berichtsheft, drei Änderungen nach dem ersten Durchgang:
  - **„Auszubildender" ist eine eigene Rolle** wie Monteur oder Vorarbeiter,
    kein Kennzeichen am Mitarbeiter. Zwei Quellen für dieselbe Aussage wären
    eine Einladung, dass sie auseinanderlaufen; das Kennzeichen ist entfallen.
    Wer es bereits gesetzt hatte, bekommt die Rolle in Migration 058.
  - **Urlaub und Krankheit füllen sich selbst** aus den genehmigten
    Abwesenheiten der Woche („Krank: Do, Fr"). Das Feld wird nicht mehr
    getippt. Ein offener Antrag gehört noch nicht in den Nachweis.
  - **Sehen und unterschreiben darf nur der eingetragene Ausbilder.** Ein
    Berichtsheft ist persönlich — es geht weder das Büro noch die
    Geschäftsführung etwas an, solange sie nicht selbst ausbilden.
- Fehler behoben, bevor er in Produktion kam: die Wochen- und Abwesenheitstage
  wurden über ein Javascript-Datum gewandelt und hingen damit an der Zeitzone
  des Servers. Mitternacht in Berlin ist in UTC der Vortag; der Wochenbericht
  wäre auf den Sonntag davor gerutscht. Gefunden, indem der Test unter
  `TZ=Europe/Berlin` lief — die Tage werden jetzt in SQL formatiert und der
  Test läuft in drei Zeitzonen.
- Die Abnahme zu Migration 003 zählte die Rollen einer Firma gegen eine feste
  Neun. Sie prüft die Mandantentrennung; jetzt vergleicht sie mit der
  tatsächlichen Rollenzahl und scheitert nicht mehr an jeder neuen Rolle.
- Fassung 0.42.8, Speicher `schaefchen-online-v50`, Migrationen 058 und 059.

- **Berichtsheft für Auszubildende** (erste Ausbaustufe des Azubi-Moduls,
  V0.60 aus dem Fahrplan). Ohne vollständigen Ausbildungsnachweis lässt die
  Kammer den Auszubildenden nicht zur Prüfung zu.
  - Ein Wochenbericht je Auszubildendem: Tätigkeiten im Betrieb, Berufsschule,
    Urlaub und Krankheit. Die geleistete Arbeitszeit wird **nicht eingetippt**,
    sondern aus der Zeiterfassung übernommen.
  - Ablauf: Entwurf → eingereicht → freigegeben, dazwischen die Rückgabe mit
    Bemerkung. Eine Rückgabe ohne Bemerkung ist nicht möglich; ein
    freigegebener Nachweis ist unveränderlich, auch für den Ausbilder.
  - Der **Ausbilder** wird am Mitarbeiter hinterlegt und darf die Berichte
    seiner Auszubildenden freigeben, auch ohne Planungsrolle — ein Vorarbeiter
    bildet aus, ohne dadurch Einblick ins Büro zu bekommen. Die Planung sieht
    alle. Sammelfreigabe für mehrere Wochen auf einmal.
  - Die Unterschrift ist eine festgehaltene Bestätigung mit Namen und
    Zeitpunkt. Der Name wird mitgeschrieben: er muss auch dann noch lesbar
    sein, wenn der Mensch die Firma längst verlassen hat.
  - Jeder Schritt bleibt in einem unveränderlichen Verlauf stehen, erzeugt vom
    Datenbank-Trigger — nicht davon abhängig, dass die Schnittstelle daran
    denkt.
  - Das Berichtsheft gehört **nicht** zum Standardumfang: die
    Plattformverwaltung gibt es je Firma frei.
  - Noch nicht enthalten: PDF-Ausdruck für die Kammer, Erinnerungen an
    fehlende Wochen, Tagesberichte. Siehe `docs/APPRENTICE_REPORTS.md`.
- Fassung 0.42.7, Speicher `schaefchen-online-v49`, Migrationen 056 und 057.

- **Fehler behoben: nach einem Benutzerwechsel auf demselben Gerät sah ein
  Monteur die Büroansichten der vorherigen Sitzung** — Stundenzettel-Export für
  alle Mitarbeiter, „Stundenzettel prüfen“, „Offene Korrekturen“ und
  „Abwesenheiten prüfen“, samt der Namen, Arbeitszeiten und Anträge anderer
  Leute. Diese vier Karten liegen in der Wochenansicht, also in einem Bereich,
  den jeder sieht; ihre Sichtbarkeit wurde aber ausschließlich in
  `renderAdmin()` gesetzt — und das läuft für einen Monteur nie. Meldete sich
  das Büro ab und ein Monteur an, blieben sie stehen. Die Sichtbarkeit wird
  jetzt bei jedem Zeichnen erzwungen, und beim Abmelden werden die Listen
  geleert.
- Die Abwesenheitserfassung steht weiter oben und ist aufgeklappt: statt
  1300 Pixel tief hinter einem zugeklappten Aufklapper beginnt sie bei
  925 Pixeln, direkt nach dem Arbeitskonto. Urlaub beantragen ist für einen
  Monteur eine der wenigen Handlungen der App.
- Die Tagesspalten der Plantafel rasten ein. Vorher blieb fast immer eine
  Spalte halb unter der klebenden Mitarbeiterspalte stehen, und die Karte
  darunter war zur Hälfte verdeckt. Einrasten wirkt nur, wenn eine Spalte neben
  die klebende Spalte passt — deshalb ist die Mitarbeiterspalte auf schmalen
  Geräten 110 statt 170 Pixel breit und eine Tagesspalte genau so breit wie der
  Rest. Die Kopfzeile klebt jetzt mit; vorher stand über der
  Mitarbeiterspalte der Tag der vorherigen Spalte.
- Das VDE-Modul nennt dem Server seine Fassung. Ohne diese Angabe gilt ein
  Aufrufer als veraltet, sobald die Plattform ein Pflichtupdate setzt — der
  Server kann eine fehlende Fassung nicht von einer zu alten unterscheiden. Das
  VDE-Modul wäre als einziges vollständig ausgefallen, und zwar erst dann, wenn
  es niemand mehr erwartet.
- Fassung 0.42.6, Speicher `schaefchen-online-v48`, Migration 055.

- Plantafel: eine Zelle zeigt höchstens zwei Karten, der Rest lässt sich mit
  „+2 weitere“ aufklappen. Alle Zellen einer Zeile liegen in derselben
  Rasterzeile — die höchste bestimmt die Höhe aller. Ein Mitarbeiter mit vier
  Einsätzen an einem Tag machte seine Zeile 679 Pixel hoch, und in den übrigen
  Tagesspalten stand ebenso viel Leere; auf dem Handy sieht man ohnehin nur
  eine Spalte auf einmal. Zusammengefaltet sind es 362 Pixel, das ganze Brett
  wird 317 Pixel kürzer. Gezählt wird weiterhin, was eingeplant ist, nicht was
  gerade zu sehen ist.
- Fassung 0.42.5, Speicher `schaefchen-online-v47`, Migration 054.

- Fehler behoben: auf den Karten der Plantafel lagen die Schaltflächen
  „Ändern“ und „Kopieren“ über dem Text. Gemessen auf dem Handy: die Karte ist
  163 Pixel breit, die beiden Schaltflächen brauchen zusammen 113 davon — jede
  muss mindestens 44 Pixel messen, damit man sie treffen kann. Nebeneinander
  blieben für den Text 20 Pixel; Baustellenname, Hinweis und das Kennzeichen
  des Vorarbeiters liefen aus ihrer Spalte heraus und lagen unter den
  Schaltflächen. Die Karte hat jetzt eine Spalte: Text oben, Schaltflächen
  darunter. Ein Test hält fest, dass beides nicht wieder in eine Zeile gerät.
- Fassung 0.42.4, Speicher `schaefchen-online-v46`, Migration 053.

- Die Bereiche der App gehören der Plattformverwaltung. Eine Firma konnte sie
  bisher selbst abschalten — der verkaufte Umfang lag damit in der Hand des
  Kunden, und ein abgeschalteter Bereich ließ sich ohne fremde Hilfe nicht
  zurückholen. Der Schalter ist aus der Firmenansicht verschwunden, der
  Schreibweg (`PATCH /api/v1/admin/modules/:key`) ist entfallen, und über jeden
  Bereich außerhalb des Kerns entscheidet jetzt die Freigabe der Plattform.
  Migration 051 trägt allen bestehenden Firmen genau die Bereiche ein, die sie
  heute sehen; neue Firmen bekommen sie beim Anlegen über einen Trigger. Der
  Verlauf der früheren firmeneigenen Schalter bleibt erhalten, wird aber nicht
  mehr ausgewertet und nicht mehr beschrieben.
- Die Firmennummer wird nur noch bei der ersten Anmeldung abgefragt. Danach
  steht die Firma fest und das Feld verschwindet; ein „Wechseln“ neben dem
  Firmennamen führt zurück, damit ein einmal falsch eingerichtetes Gerät nicht
  festsitzt.
- Fehler behoben: die Büroverwaltung — Jahreskonten, Feiertagskalender und die
  Regel für Zeitkorrekturen — stand in **allen drei** Verwaltungsansichten.
  Einsätze, Baustellen und Mehr zeigten dieselben Karten, weil sie im
  gemeinsamen Verwaltungsbereich lagen und keine eigene Zuordnung hatten.
- Fehler behoben: in der Wochenansicht stand über dem nächsten Einsatz
  „Invalid Date“. Die Schnittstelle liefert die Einsätze je Tag und trägt kein
  Datum in den einzelnen Einsatz ein. `shortDate` gibt jetzt lieber nichts aus
  als einen kaputten Text.
- Fehler behoben: über den erfassten Arbeitstagen stand fest „Diese Woche“,
  auch wenn eine früher liegende Woche geblättert war.
- Fehler behoben: im Kopf der App stand das Firmenzeichen allein in einer
  eigenen Zeile über dem Firmennamen. `.brand--small span` setzte weiter unten
  `display: block` und stach die Regel für die Firmenzeile aus — dieselbe Falle
  wie bei den Medienabfragen, nur ohne Medienabfrage. Ein Test hält sie fest.
- Fehler behoben: bei abgeschlossenem Arbeitstag stand auf der großen
  Schaltfläche Wort für Wort derselbe Satz wie in der Überschrift darüber. Eine
  Schaltfläche, die nichts auslöst, wird jetzt gar nicht erst gezeigt.
- Unter „Mehr“ stand für einen Monteur nur ein Hinweistext. Dort steht jetzt
  sein Konto: Name, Personalnummer, Firma, Rolle — und „Abmelden“.
- Jede ausgelieferte Javascript-Datei wird als Modul auf Syntax geprüft.
  `node --check datei.js` prüft ohne `package.json` **nicht** als Modul: eine
  überzählige Klammer mitten in `app.js` kam so durch die Prüfung, die App
  startete nicht mehr, und alle Tests waren trotzdem grün.
- Fassung 0.42.3, Speicher `schaefchen-online-v45`, Migration 052.

- Fehler behoben: während einer Veröffentlichung ließ sich die App auf einem
  eingerichteten Gerät gar nicht mehr öffnen. Die Seite selbst wird immer frisch
  geholt; direkt nach einer Veröffentlichung verweist sie auf Dateien mit neuer
  Fassungsnummer — und genau in diesem Moment ist der Dienst nicht erreichbar
  oder läuft erst wieder an. Das Gerät hatte dann die neue Seite, aber kein
  `app.js` dazu und blieb weiß. Der Dienst-Worker nimmt jetzt im Fehlerfall
  dieselbe Datei aus der vorherigen Fassung; eine Fassung zu alt und laufend ist
  besser als gar keine. Auch eine Fehlerseite des anlaufenden Dienstes (Status
  ab 500) ersetzt keine Datei mehr. War die Datei nie da, schlägt der Fehler
  weiterhin durch — ein Rückfall darf nichts erfinden.

- Fehler behoben: die Anmeldung kam nur zu einer einzigen Firma. Das Feld für
  die Firmennummer war dauerhaft verborgen und fest mit der im Server
  hinterlegten Firma der Ersteinrichtung gefüllt; ein Mitarbeiter jeder
  weiteren Firma konnte sich gar nicht anmelden, obwohl die Schnittstelle
  jede Firmennummer längst annahm. Das Feld steht jetzt im Anmeldeformular,
  nimmt die üblichen Schreibweisen entgegen (`f-000024`, `F 000024`, `24`) und
  merkt sich die zuletzt benutzte Firma samt Namen auf dem Gerät. Ohne Nummer
  geht die Anmeldung gar nicht erst zum Server.
- nach dem Anlegen einer Firma zeigt die Plattformverwaltung, was der neue
  Kunde für die Anmeldung braucht: Firmennummer und Personalnummer der ersten
  Administration, zum Kopieren. Vorher schloss sich der Dialog wortlos und die
  Nummer musste in der Liste gesucht werden.
- die Fassung des Servers steht als `APPLICATION_VERSION` an einer Stelle. Sie
  stand als Zeichenkette in der Fehleraufzeichnung und in zwei Tests; beim
  Ausliefern wurde sie dort regelmäßig vergessen.

- Fehler behoben: eine über „Firma anlegen“ direkt erzeugte Firma war dauerhaft
  unbenutzbar. Sie bekam keinen Benutzer, und es gab keinen Weg, einen
  anzulegen: die Ersteinrichtung der App gilt nur für die im Server hinterlegte
  erste Firma. Der Anlegedialog fragt jetzt die erste Administration mit ab, und
  ein eigener Weg der Plattformverwaltung legt sie nach. Er greift nur, solange
  die Firma keine aktive Administration hat; danach vergibt sie ihre Konten
  selbst.
- die Trennung mehrerer Firmen ist nachgewiesen: eigene Anmeldung, eigene
  Nummernkreise, keine fremden Daten in der Übersicht, 404 beim Direktzugriff
  auf einen fremden Datensatz und 401 bei einer Anmeldung mit fremdem Konto in
  der falschen Firma.

- Fassung 0.42.2. Speicher `schaefchen-online-v44`, alle Dateien tragen
  `?v=0.42.2`, Migration 050 setzt den Produktionsstand. Die Abnahme zu 049
  verlangt nicht mehr, dass 0.42.1 der Produktionsstand ist: das wäre mit der
  nächsten Fassung falsch geworden, ohne dass etwas kaputt gewesen wäre.

- Fassung 0.42.1. Der Dienst-Worker liefert die Dateien der App aus einem
  Zwischenspeicher aus, ohne beim Server nachzufragen. Solange Fassungsnummer
  und Speichername gleich blieben, erreichte **keine** Korrektur der Oberfläche
  ein bereits eingerichtetes Gerät — auch nach einer Veröffentlichung nicht.
  Der Speicher heißt jetzt `schaefchen-online-v43`, alle Dateien tragen
  `?v=0.42.1`, und Migration 049 setzt den Produktionsstand entsprechend.
  Offline abgelegte Baustellendokumente bleiben erhalten: ihr Speicher wird
  bewusst nicht mitgewechselt.

- zwei zusätzliche Prüfungen der Oberfläche: jedes der 35 Formulare muss einen
  Absende-Empfänger haben, und ein unmittelbar übergebener Ereignisbehandler
  darf als ersten Wert nur das Ereignis erwarten. Die zweite Prüfung gilt jetzt
  auch für das VDE-Modul und die Plattformverwaltung, nicht mehr nur für die
  Haupt-App.

- Fehler behoben: die Vorlage für den Baustellen-Import war leer. Zwei Blätter
  ohne Spaltenüberschriften und ohne Beispiel; wer sie herunterlud, wusste
  nicht, welche Spalten gefüllt werden müssen, und jeder Upload endete mit
  „Die Excel-Datei enthält keine Baustellenzeilen.“ Die Vorlage enthält jetzt
  die Überschriften, eine ausgefüllte Beispielzeile und ein Hinweisblatt mit
  den Pflichtspalten und den erkannten Schreibweisen. Ein Test importiert die
  mitgelieferte Vorlage.

- der Baustellenlink und der QR-Code führen jetzt auch dann in die
  Baustellenakte, wenn der Mitarbeiter für diese Baustelle nicht eingeteilt
  ist. Wer vor Ort den Aufkleber scannt, steht auf dieser Baustelle; bisher
  endete der Weg mit „Diese Baustelle ist dir heute nicht zugewiesen“, obwohl
  ein Mitarbeiter seine Baustelle selbst wählen darf. Die Wahl wird übernommen
  und als eigene Auswahl vermerkt.
- die Baustellenwahl nimmt neben der Baustellen-ID auch die QR-Kennung
  entgegen. Der Link trägt die Kennung, nicht die ID.
- der Fall „allein auf der Baustelle, Rückkehr nach einer Unterbrechung“ hat
  jetzt einen eigenen, unabhängigen Test mit eigener Firma.

- die fachliche Bewertung eines VDE-Stromkreises ist jetzt einzeln geprüft:
  Isolationswiderstand unter 1 MΩ, Auslösestrom über dem Bemessungswert,
  fehlende Messwerte und die Bezeichnung jeder Schutzorgan-Bauart. Bisher war
  sie nur mittelbar über das fertige PDF abgedeckt. Ebenso die
  Eingabeprüfungen der Plattformverwaltung.
- die Mindestabdeckung in der Prüffolge steigt auf 86 Prozent Zeilen,
  73 Prozent Zweige und 94 Prozent Funktionen.

- Fehler behoben: wer nach einer Unterbrechung auf dieselbe Baustelle
  zurückkehrte, verlor die Berichtsverantwortung. Die automatische
  Vorarbeiterfunktion zählte Einsatzzeilen statt Menschen: die Rückkehr legt
  einen zweiten Eintrag an, und der galt als Teambelegung. Der allein
  Arbeitende wurde dadurch zum Monteur zurückgestuft, obwohl niemand
  hinzugekommen war. Gezählt werden jetzt die Menschen auf der Baustelle.
- die Berichtsverantwortung gilt für den Mitarbeiter auf dieser Baustelle an
  diesem Tag, nicht für einen einzelnen Einsatzeintrag. Bei mehreren Fahrten
  zur selben Baustelle trug nur die erste die Verantwortung, sodass der
  Zugang zum Bericht nach der Rückkehr verschwand.

- Fehler behoben: die Baustellenakte ließ sich vom Einsatz aus nicht öffnen. Der
  Knopf war sichtbar, meldete aber „Für heute ist keine Baustelle freigegeben“,
  obwohl ein Einsatz vorlag. Der Klick wurde unmittelbar an die Funktion
  weitergereicht, die daraufhin das Klickereignis für den angeforderten Einsatz
  hielt. Ein Vorarbeiter kam damit gar nicht an Aufgaben, Berichte, Fotos,
  Dokumente, Material und Notizen seiner Baustelle. Ein Test prüft jetzt jeden
  unmittelbar übergebenen Ereignisbehandler auf diesen Fehler.

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
