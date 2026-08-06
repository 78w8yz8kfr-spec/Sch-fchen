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
* **Eingereicht wird nur eine vollständige Woche.** Jeder Tag mit Arbeitszeit
  braucht mindestens eine Zeile; ein Tag mit Abwesenheit ist durch die
  Abwesenheit erklärt. Sonst stünde im Ausdruck eine leere Zeile neben
  „07:45 h“ — und das fällt erst am Ende der Ausbildung auf, wenn sich die
  Woche nicht mehr rekonstruieren lässt. Die App sagt beim Schreiben, welche
  Tage noch offen sind, und sperrt „Einreichen“ so lange.
* Nach dem Einreichen sind die Felder **gesperrt** — das ist der Sinn der
  Unterschrift. Auf dem Bildschirm steht, warum: eine Sperre, die sich nicht
  erklärt, sieht aus wie ein Fehler.
* **Solange der Ausbilder nicht unterschrieben hat, gehört der Bericht dem
  Auszubildenden.** Er holt ihn mit „Wieder bearbeiten“ selbst zurück; die
  eigene Unterschrift wird dabei zurückgenommen, die geschriebenen Tage
  bleiben stehen. Im Papierheft streicht man vor der Unterschrift des
  Ausbilders ebenso einfach durch. Ohne diesen Weg war eine zu früh
  eingereichte Woche eine Sackgasse: schreiben ging nicht mehr, und der
  Auszubildende musste warten, bis jemand anders sie zurückgibt.
* Ein **freigegebener** Nachweis lässt sich nicht mehr zurückholen — dort steht
  die Unterschrift des Ausbilders, und die gehört ihm.
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
| `POST /api/v1/apprentice/reports/:montag/withdraw` | Auszubildender, zurückholen (nicht nach der Freigabe) |
| `GET /api/v1/apprentice/reports/:montag/pdf` | Auszubildender, eigene Woche als A4-Blatt |
| `GET /api/v1/apprentice/reports/pdf?from=&to=` | Auszubildender, ein ganzer Zeitraum in einer Datei |
| `GET …/pdf?apprenticeUserId=` | Ausbilder, Woche oder Zeitraum eines seiner Auszubildenden |
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
* Eine **Vorschau** (`?preview=true`) ist auch für einen Entwurf erlaubt — sie
  zeigt beim Schreiben, wie das Blatt wird. Damit sie nicht mit dem fertigen
  Nachweis verwechselt wird, trägt sie quer über dem Blatt „VORSCHAU“, sagt es
  im Fuß und im Dateinamen, und sie wird **im Browser angezeigt** statt in den
  Downloadordner gelegt (`Content-Disposition: inline`). Nur diese Antwort darf
  von der eigenen Seite eingerahmt werden (`frame-ancestors 'self'`); für alle
  übrigen bleibt das Einrahmen verboten.
* Ein **Entwurf wird nicht gedruckt** (409). Auf Papier sieht er fertig aus und
  ist es nicht; im Ordner der Kammer fällt das erst am Ende der Ausbildung auf.
  Gedruckt wird, was eingereicht oder freigegeben ist — also unterschrieben.

## Wo es steht

Das Berichtsheft ist ein **eigener Bereich** in der Navigation („Nachweis“),
kein Anhängsel der Wochenansicht. Für den Auszubildenden ist es die Arbeit, die
er täglich neben der Zeiterfassung hat; für den Ausbilder die, die er
wöchentlich abzeichnet. Der Bereich erscheint nur bei diesen beiden — für alle
anderen ist er nicht da.

Er enthält:

* die **Woche** mit einer Zeile je Tag, samt eigenem Wochenwechsel. Die
  angezeigte Woche ist dieselbe wie im Stundenzettel: zwei getrennte
  Wochenstände in einer App wären für niemanden nachvollziehbar.
* die **fehlenden Wochen** mit einem Weg direkt hinein,
* die **bisherigen Berichte** — jede Zeile führt in ihre Woche zurück und
  lässt sich von dort drucken,
* für den Ausbilder die **Prüfliste** und darüber seine Auszubildenden, jeder
  mit seinem Stand („2 Wochen offen“ oder „Alle Wochen abgegeben“) und dem Weg
  zum gedruckten Heft eines ganzen Jahres.

Der Wochenwechsel gehört zum eigenen Heft und erscheint deshalb nur beim
Auszubildenden — beim Ausbilder stand er da und tat nichts.

Die Navigationsleiste richtet sich nach den sichtbaren Schaltflächen; eine fest
verdrahtete Spaltenzahl wäre mit jedem neuen Bereich falsch.

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

## Fehlende Wochen

Am Ende der Ausbildung ist eine fehlende Woche teuer, und bis dahin fällt sie
niemandem auf. Deshalb rechnet der Server sie aus, statt darauf zu warten, dass
jemand nachzählt:

* Eine Woche gilt als **fällig**, sobald in ihr gearbeitet wurde oder eine
  genehmigte Abwesenheit lag. Wochen ohne beides sind keine Lücke — vor dem
  Ausbildungsbeginn, im Betriebsurlaub oder vor dem Eintritt hat niemand etwas
  versäumt.
* **Offen** bleibt sie, bis ein Bericht eingereicht oder freigegeben ist. Ein
  Entwurf zählt nicht: geschrieben ist nicht abgegeben.
* Die **laufende Woche** wird nie angemahnt, sie ist noch nicht vorbei.
* Weiter zurück als bis zum Ausbildungsbeginn — ersatzweise ein Jahr — wird
  nicht gesucht.

Der Auszubildende sieht seine Lücken über dem Wochenformular, mit einem Weg
direkt in die betreffende Woche. Der Ausbilder sieht sie in seiner Prüfliste
über alle seine Auszubildenden: ein Bericht, den niemand abgibt, fällt in einer
Liste eingereichter Berichte sonst nicht auf.

## Ein Zeitraum am Stück

`GET /api/v1/apprentice/reports/pdf?from=&to=` liefert **eine Datei mit einer
Seite je Woche**. Am Ende der Ausbildung sind das gut hundertfünfzig Blätter;
sie Woche für Woche einzeln zu laden und von Hand zu heften ist genau die
Arbeit, die diese App abnehmen soll. In der App steht dafür „Jahr … drucken“.

* Die Wochen werden **geordnet** gedruckt, unabhängig davon, wie sie ankommen.
* Das **Lehrjahr** wird je Woche gerechnet — ein Heft über zwei Lehrjahre trüge
  sonst auf allen Blättern dasselbe.
* Das **Logo** wird einmal eingebettet und auf jedem Blatt verwendet.
* Die **Seitenzahl** zählt über das ganze Heft durch, nicht je Woche neu.
* Ein Zeitraum ohne einen einzigen Bericht ist kein leeres Heft, sondern eine
  klare Auskunft (404).

## Noch nicht enthalten

* Eine **Erinnerung, die von selbst kommt** — als Mitteilung oder E-Mail. Heute
  sieht man die Lücken, sobald man die App öffnet.
