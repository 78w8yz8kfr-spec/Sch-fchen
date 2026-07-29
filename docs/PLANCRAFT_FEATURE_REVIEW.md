# Plancraft-Featureprüfung für Schäfchen

Stand: 29.07.2026  
Technischer Stand: V0.37.0

## Ziel und Leitplanken

Plancraft dient ausschließlich als öffentlich zugängliche Produktreferenz. Schäfchen übernimmt keine Gestaltung, Texte oder vollständigen Module, sondern nur Arbeitsmuster, die den bestehenden Ablauf für Elektrobetriebe nachweislich vereinfachen.

Für jede Übernahme gelten die Schäfchen-Grundsätze:

- eine sichtbare Baustelle statt doppelter Projekt- und Baustellenordner
- wenige große, eindeutige Aktionen
- Monteure sehen nur ihren nächsten sinnvollen Schritt
- Büro und Baustelle arbeiten mit demselben Datenbestand
- keine neue Funktion ohne Rollen-, Mandanten- und Verlaufsprüfung

## Beobachtete Plancraft-Muster

Die öffentlich dokumentierten Plancraft-Abläufe bündeln Auftragsdaten, Mitarbeiter, Dokumente, Berichte und Zeiterfassung in einer zentralen Projektakte. Aus der Einsatzplanung gelangen mobile Mitarbeiter direkt zu Navigation, Zeiterfassung, Bericht und Projektordner. Zugewiesene Mitarbeiter sehen nur ihre relevanten Projekte. Berichte werden aus Projekt- und Kundendaten vorausgefüllt und können mobil bearbeitet werden. Abwesenheiten können mobil erfasst werden und erscheinen gemeinsam mit Einsätzen in der Plantafel.

Diese Muster passen grundsätzlich zu Schäfchen. Die sichtbare Einheit heißt hier jedoch konsequent **Baustelle**. Die intern notwendige Projektebene bleibt verborgen.

## Entscheidung

| Muster | Entscheidung für Schäfchen | Begründung |
|---|---|---|
| Zentrale Projekt-/Baustellenakte | Bereits vorhanden, weiter vereinfachen | Arbeitsauftrag, Team, Aufgaben, Berichte, Dokumente, Fotos, Notizen und Material liegen schon an einer Baustelle. |
| Direkte Aktionen aus dem Tageseinsatz | In V0.34.0 übernehmen | Navigation und Baustellenakte sind ohne Umweg erreichbar; der verantwortliche Mitarbeiter kann den Bericht bereits vor der Abfahrt speichern. |
| Mobile Aufgabenbearbeitung | In V0.34.0 übernehmen | Monteure können sichtbare Aufgaben beginnen, erledigen und wieder öffnen. Rollen-, Tages- und Baustellenzugriff werden serverseitig geprüft. |
| Häufige Büroaktionen an der Baustelle | In V0.34.0 übernehmen | Einsatz planen, Bericht, Dokument und Aufgabe sind direkt am Baustellenkopf erreichbar. |
| Nur zugewiesene mobile Baustellen | Bereits vorhanden | Schäfchen erzwingt die tagesbezogene Zuweisung bereits serverseitig. |
| Vorausgefüllte mobile Berichte und Entwurf | Bereits vorhanden, in V0.34.0 ergänzen | Team und Stunden werden vorausgefüllt; Entwürfe funktionieren offline. Neu ist das Speichern ohne gleichzeitiges Verlassen der Baustelle. |
| Plantafel mit Start, Dauer und Arbeitsauftrag | In V0.35.0 übernehmen | Schäfchen ergänzt die vorhandene Wochenplanung um geplante Dauer und einsatzbezogene Arbeitsanweisung, ohne eine komplexe Ressourcenplanung einzuführen. |
| Tagesübersicht für die Disposition | In V0.35.0 übernehmen | Eingeplante und freie Feldmitarbeiter, laufende Zeiten und Prüfbedarf werden in einer ruhigen Tageskarte zusammengeführt. |
| Team und Kontaktdaten am mobilen Einsatz | In V0.35.0 übernehmen | Telefonnummer und E-Mail gehören zu den Mitarbeiterstammdaten und sind aus der tagesbezogenen Baustellenakte erreichbar. |
| Abwesenheiten mobil erfassen und in der Plantafel anzeigen | In V0.36.0 übernehmen und absichern | Schäfchen ergänzt eigene Anträge, ganze und halbe Tage sowie eine zweistufige Freigabe. Erst danach wirkt die Abwesenheit verbindlich auf die Einsatzplanung. |
| Fortlaufendes Arbeitszeitkonto und Jahresurlaub | In V0.37.0 in eigener Form übernehmen | Schäfchen verbindet vorhandenes Soll, berechnete Arbeitstage und verbindliche Abwesenheiten. Urlaub bleibt kalenderjahrbezogen; manuelle Salden sind unveränderliche Gegenbuchungen statt überschreibbarer Werte. |
| Frei konfigurierbare Projektstatus | Später prüfen | Die vorhandenen Status reichen für den aktuellen Betriebsablauf. Zusätzliche Status lohnen sich erst mit klaren realen Fällen. |
| Freigabe einzelner Dokumente für Mobilrollen | Später prüfen | Fachlich sinnvoll, benötigt aber ein eigenes Freigabemodell und eine Datenmigration. |
| Plan-/Ist-Nachkalkulation | Später prüfen | Erst sinnvoll, wenn Zeit-, Material- und Kostenstammdaten über mehrere reale Aufträge stabil gepflegt werden. |
| Vollständige Angebots-, Rechnungs- und Buchhaltungswelt | Nicht jetzt übernehmen | Würde den Kern Zeiterfassung, Einsatz und Baustellenarbeit unnötig verbreitern. |
| Sichtbare zusätzliche Projektebene | Nicht übernehmen | Widerspricht der bewusst flachen Baustellenansicht und erzeugt doppelte Wege. |
| Allgemeiner Projektchat | Nicht übernehmen | Gemeinsame Baustellennotizen decken den konkreten Bedarf mit weniger Ablenkung ab. |

## In V0.34.0 umgesetzter Ablauf

### Monteur

1. Der heutige Einsatz zeigt direkt **Navigation** und **Baustellenakte**.
2. Auf der Baustelle kann der zuständige Mitarbeiter den **Bericht** vorab speichern und arbeitet danach normal weiter.
3. Sichtbare Aufgaben wechseln mit einer Aktion von **Offen** zu **In Arbeit** und anschließend zu **Erledigt**.
4. Archivieren bleibt eine Büroaktion. Fremde oder nicht zugewiesene Baustellen bleiben gesperrt.

### Büro und Disposition

1. Eine Baustelle wird in der flachen Baustellenliste geöffnet.
2. Am Kopf stehen die vier häufigsten Folgeaktionen: **Einsatz planen**, **Bericht**, **Dokument** und **Aufgabe**.
3. Schäfchen öffnet jeweils den vorhandenen Fachbereich und übernimmt die gewählte Baustelle automatisch.

## In V0.35.0 ergänzter Ablauf

### Planung und Disposition

1. Beim Einsatz werden neben Datum und Startzeit eine optionale Dauer und eine konkrete Arbeitsanweisung hinterlegt.
2. Die Wochenplanung zeigt diese Angaben direkt an der Zuweisung; Änderungen bleiben über den vorhandenen Änderungsgrund historisiert.
3. Die Tageslage macht sichtbar, welche Monteure und Vorarbeiter eingeplant oder noch frei sind, welche Arbeitstage laufen und wo eine Zeitprüfung offen ist.

### Baustellenteam

1. Der Tageseinsatz zeigt Dauer und Arbeitsanweisung vor dem Start.
2. Die Baustellenakte übernimmt dieselben Angaben und zeigt das heute eingeplante Team.
3. Hinterlegte Telefonnummern oder E-Mail-Adressen sind direkt als Kontaktaktion erreichbar. Der Zugriff bleibt auf die zugewiesene Baustelle und den gewählten Tag begrenzt.

## In V0.36.0 ergänzter Ablauf

### Mitarbeiter

1. In der eigenen Woche werden Art, Zeitraum, ganzer oder halber Tag und ein optionaler Hinweis erfasst.
2. Der Antrag bleibt mit seinem aktuellen Prüfstatus und dem letzten nachvollziehbaren Schritt sichtbar.
3. Solange keine verbindliche Freigabe vorliegt, kann der Mitarbeiter den Antrag mit Begründung zurückziehen.

### Büro und Geschäftsführung

1. Büro oder Disposition prüft den Antrag zuerst und dokumentiert Freigabe oder Ablehnung.
2. Die Geschäftsführung entscheidet anschließend verbindlich; beide Schritte müssen von verschiedenen Konten stammen.
3. Vor einer ganztägigen Freigabe müssen vorhandene Einsätze verschoben oder storniert werden.
4. Freigegebene Abwesenheiten erscheinen in Wochenplanung und Tageslage und sperren denselben Mitarbeiter-Tag transaktional gegen neue Einsätze.

## In V0.37.0 ergänzter Ablauf

### Mitarbeiter

1. Die vorhandene Woche zeigt das eigene fortlaufende Stundenkonto, ohne eine weitere Hauptnavigation einzuführen.
2. Soll, Ist, Abwesenheitsgutschrift, monatliche Bewegung und laufender Stand bleiben getrennt nachvollziehbar.
3. Jahresurlaub zeigt Anspruch, verbindlich genehmigte Tage, offene Anträge und verbleibende Tage; Überstundenabbau wird separat ausgewiesen.

### Büro und Geschäftsführung

1. Planungsrollen sehen die Kontostände aller aktiven Mitarbeiter als kompakte Jahresliste.
2. Nur Administration oder Geschäftsführung ändern Startdatum, Aktivierung oder den Anspruch des gewählten Kalenderjahres.
3. Startsaldo und spätere Korrekturen benötigen Datum, Vorzeichen und Begründung. Eine gespeicherte Buchung bleibt unverändert; Fehler werden gegengebucht.
4. Heute und Zukunft erzeugen noch kein Minus. Vergangene fehlende Arbeitstage werden ab Kontostart gegen das Wochensoll gerechnet.

## Öffentliche Referenzen

- [Zeiterfassung im Handwerk](https://plancraft.com/de-de/funktionen/zeiterfassung-handwerk)
- [Handwerker-App](https://plancraft.com/de-de/funktionen/handwerker-app)
- [Teams gemeinsam planen](https://plancraft.com/de-de/produktupdates/teams-planen-2024-07)
- [Projekt anlegen und verwalten](https://help.plancraft.com/de/articles/382654-projekt-in-plancraft-anlegen-und-verwalten)
- [Projektübersicht und Arbeitsstunden](https://help.plancraft.com/de/articles/382729-projektubersicht-arbeitsstunden-kontaktdaten-und-beschreibung-bearbeiten)
- [Mitarbeitende einem Projekt zuweisen](https://help.plancraft.com/de/articles/382733-mitarbeitende-einem-projekt-zuweisen)
- [Ablage in Projekten](https://help.plancraft.com/de/articles/382740-ablage-in-projekten-dateien-zentral-speichern-und-verwalten)
- [Berichte erstellen und unterschreiben](https://help.plancraft.com/de/articles/382751-berichte-in-plancraft-erstellen-ausfullen-und-unterschreiben)
- [Plantafel für Einsatzplanung](https://help.plancraft.com/de/articles/382799-plantafel-fur-projekt-einsatz-und-abwesenheitsplanung)
- [Plancraft-App und mobiler Aufbau](https://help.plancraft.com/de/articles/382683-plancraft-app-zielgruppe-download-registrierung-und-aufbau)
- [Arbeitszeiten und Abwesenheiten erfassen](https://help.plancraft.com/de/articles/382797-arbeitszeiten-und-abwesenheiten-erfassen-und-exportieren)
- [Arbeitszeitkonto und Berechnung](https://help.plancraft.com/de/articles/543983-arbeitszeitkonto-finden-kontostand-korrigieren-und-berechnung-verstehen)
- [Urlaubsanspruch und Resturlaub](https://help.plancraft.com/de/articles/517281-urlaubsanspruch-in-plancraft-festlegen-und-resturlaub-verwalten)
- [Nachkalkulation](https://help.plancraft.com/de/articles/382735-nachkalkulation-plan-und-ist-kosten-im-projekt-vergleichen)
