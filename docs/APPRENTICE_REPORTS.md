# Berichtsheft (Ausbildungsnachweis)

Erste Ausbaustufe des Azubi-Moduls aus dem Fahrplan (V0.60).

## Warum

Ein Auszubildender muss seine Ausbildung schriftlich nachweisen. Ohne
vollständiges Berichtsheft lässt die Kammer ihn nicht zur Prüfung zu.

**Geschrieben wird täglich, ausgedruckt wöchentlich.** Der Nachweis besteht aus
einer Zeile je Tag — Tag, Datum, was an diesem Tag getan wurde, Arbeitszeit —
und daraus entsteht eine A4-Seite je Woche. Ein einzelner Wochentext täte das
nicht: er sagt nicht, an welchem Tag was war, und genau das will die Kammer
sehen. Der Ausbilder gibt frei oder gibt mit einer Bemerkung zurück.

## Wer ist beteiligt

| Rolle | Recht |
| --- | --- |
| Auszubildender (Rolle `apprentice`) | schreibt und reicht seine eigenen Wochenberichte ein |
| Ausbilder (`users.trainer_user_id`) | sieht und unterschreibt die Berichte **seiner** Auszubildenden |
| alle anderen — Büro, Geschäftsführung, Administrator | sehen nichts davon |

**Ein Berichtsheft ist persönlich.** Darin steht, was jemand gelernt hat, wann
er krank war und was ihm der Ausbilder zurückgegeben hat. Das geht das Büro
nichts an, solange es nicht selbst ausbildet — und die Geschäftsführung
ebenso wenig. Wer den Ausbilder wechselt, ändert damit auch, wer den Nachweis
sehen darf; das ist gewollt und bleibt am Mitarbeiter nachvollziehbar.

„Auszubildender" ist eine eigene Rolle wie Monteur oder Vorarbeiter. Der
Ausbilder wird beim Auszubildenden hinterlegt (Verwaltung → Mitarbeiter
bearbeiten), sichtbar nur, wenn die Firma das Modul hat und die Rolle gewählt
ist.

## Ablauf

```
Entwurf ──einreichen──► Eingereicht ──freigeben──► Freigegeben (unveränderlich)
   ▲                          │
   └──────nachbessern─────────┴──zurückgeben──► Zurückgegeben (mit Bemerkung)
```

* Eine Woche beginnt am **Montag**. Die Zeiterfassung rechnet ebenso; zwei
  verschiedene Wochenschnitte in einer App wären für niemanden nachvollziehbar.
* Je Auszubildendem und Woche gibt es **genau einen** Bericht.
* Die geleistete Arbeitszeit wird **nicht eingetippt**, sondern aus der
  Zeiterfassung übernommen. Wer sie abschreiben müsste, schriebe sie
  irgendwann falsch ab — und die Kammer sähe eine andere Zahl als das Büro.
* **Urlaub und Krankheit füllen sich ebenso von selbst**, aus den genehmigten
  Abwesenheiten der Woche. Sie stehen in einem eigenen Feld `absence` der
  Tageszeile, nicht zwischen den geschriebenen Tätigkeiten: beides in dasselbe
  Feld zu mischen hieße, es beim nächsten Speichern erneut hineinzumischen —
  nach dem dritten Mal stünde „Urlaub" dreimal in der Zeile. Ein offener
  Antrag gehört noch nicht in den Nachweis. Die Tage werden in SQL formatiert,
  nicht über ein Javascript-Datum: Mitternacht in Berlin ist in UTC der
  Vortag, und der Eintrag rutschte sonst je nach Zeitzone des Servers um einen
  Tag.
* Ein Tag, an dem **gearbeitet wurde oder eine Abwesenheit lag**, bekommt seine
  Zeile auch dann, wenn nichts geschrieben wurde. Im Nachweis darf kein Tag
  fehlen.
* Eine **Rückgabe ohne Bemerkung** ist nicht möglich: der Auszubildende wüsste
  sonst nicht, was er nachbessern soll.
* Ein **freigegebener** Nachweis ist unveränderlich, auch für den Ausbilder.
  Er ist ein Nachweis; wer ihn nachträglich ändern könnte, könnte die
  Ausbildung umschreiben.
* Die **Unterschrift** ist eine festgehaltene Bestätigung mit Namen und
  Zeitpunkt, keine gemalte Unterschrift. Der Name wird mitgeschrieben: er muss
  auch dann noch lesbar sein, wenn der Mensch die Firma längst verlassen hat.
* Jeder Schritt bleibt in `apprentice_report_events` stehen, erzeugt vom
  Datenbank-Trigger. Der Verlauf lässt sich nicht ändern und nicht löschen.

## Schnittstelle

| Weg | Wer |
| --- | --- |
| `GET /api/v1/apprentice/reports?from=&to=` | Auszubildender, eigene Berichte |
| `PUT /api/v1/apprentice/reports/:montag` | Auszubildender, Entwurf speichern |
| `POST /api/v1/apprentice/reports/:montag/submit` | Auszubildender, einreichen |
| `GET /api/v1/apprentice/reports/:montag/pdf` | Auszubildender, eigene Woche als A4-Blatt |
| `GET …/pdf?apprenticeUserId=` | Ausbilder, Woche eines seiner Auszubildenden |
| `GET /api/v1/admin/apprentice-reports` | Ausbilder |
| `POST /api/v1/admin/apprentice-reports/review` | Ausbilder, einzeln oder als Sammelfreigabe |

Alle Wege setzen voraus, dass die Plattformverwaltung das Modul
`apprentice_reports` für die Firma freigegeben hat; sonst antworten sie mit
409 `module_disabled`. Das Berichtsheft gehört **nicht** zum Standardumfang:
es ist ein eigener verkaufter Bereich.

## Der Ausdruck

Eine Woche ist **eine A4-Seite**: Logo oder Firmenname, „BERICHTSHEFT" mit
Kalenderwoche nach ISO 8601 und Datumsspanne, ein Kopfkasten mit Azubi,
Lehrjahr, Ausbildungsberuf und Intervall, die Tagestabelle, „Bemerkungen zur
Woche" und beide Unterschriften mit Namen und Datum. Am Fuß steht, dass der
Nachweis ohne Unterschriften ungültig ist.

* Das **Lehrjahr** wird aus dem Ausbildungsbeginn gerechnet, nicht gepflegt:
  von Hand gepflegt wäre es spätestens im zweiten Jahr falsch.
* Der Fußbereich steht **fest**. Die Tagestabelle bekommt den Platz darüber und
  verkleinert ihre Schrift, bis sie hineinpasst. Erst wenn selbst die kleinste
  noch lesbare Schrift nicht reicht, läuft die Woche auf ein zweites Blatt —
  geschriebene Zeilen abzuschneiden wäre der schlechtere Handel, der Nachweis
  wäre dann unvollständig. Die Seitenzahl am Fuß sagt, wie viele Blätter es
  geworden sind.
* Ein **Entwurf** lässt sich ebenfalls drucken und von Hand unterschreiben.

## Wann es auftaucht

Das Heft lag zuerst allein im Wochenbereich. Dort sucht am Feierabend niemand
danach, und wer erst am Freitag anfängt, weiß den Montag nicht mehr. Es kommt
deshalb von selbst:

* **Beim Feierabend.** Stempelt ein Auszubildender Feierabend und steht für
  heute noch nichts im Heft, fragt Schäfchen, was er heute gemacht hat. Die
  Zeitbuchung wartet dabei auf nichts: sie ist bereits gebucht, bevor die Frage
  kommt — ein später gestempelter Feierabend wäre eine falsche Arbeitszeit, und
  die wiegt schwerer als ein fehlender Satz. „Später" schließt die Frage.
* **Auf der Startseite**, als eigene Karte direkt unter dem Arbeitstag. Solange
  für heute nichts eingetragen ist, fällt sie auf; danach ist sie eine ruhige
  Bestätigung.

Der Tageseintrag hängt immer an der **laufenden** Woche, nicht an der
angezeigten: wer im Stundenzettel zurückblättert und dann Feierabend macht,
trüge sonst in die falsche Woche ein.

## Noch nicht enthalten

* **Erinnerungen** an fehlende Wochen (heute sieht man offene Berichte nur,
  wenn man in die Liste schaut).
* **Ein Ausdruck über mehrere Wochen** am Stück, etwa ein ganzes Lehrjahr in
  einer Datei.
