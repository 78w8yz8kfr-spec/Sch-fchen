# Passwort vergessen — welcher Weg gilt wann

Es gibt drei Wege zurück ins Programm. Welcher gilt, hängt nur daran, **wer**
sein Passwort vergessen hat. Fang immer beim obersten an; der letzte ist der
Notausgang und soll die Ausnahme bleiben.

## 1. Monteur, Büro, jede normale Rolle → das Büro setzt zurück

In der Mitarbeiterverwaltung gibt es zu jedem Mitarbeiter „Passwort
zurücksetzen". Das Büro gibt eine Begründung ein, das Programm erzeugt ein
Startpasswort und zeigt es **einmalig** an. Dieses Passwort wird der Person
durchgegeben; beim nächsten Anmelden verlangt das Programm sofort ein neues,
das nur sie selbst kennt.

Was dabei mit passiert, und warum:

- Alle Sitzungen der Person werden beendet. Wer das Passwort vergessen hat,
  weiß meistens auch nicht mehr, auf welchen Geräten er angemeldet ist.
- Eine Kontosperre wird aufgehoben. Nach zehn Fehlversuchen sperrt das
  Programm ein Konto für eine Weile — und genau wer sein Passwort vergessen
  hat, hat vorher mehrfach falsch geraten. Ohne diesen Schritt wäre das
  Passwort neu und das Konto trotzdem zu.
- Der Vorgang steht mit Begründung in der Mitarbeiterhistorie. Das Passwort
  selbst steht dort **nicht**.

Das Büro darf auf diesem Weg **keine** Geschäftsführung zurücksetzen. Sonst
könnte sich jemand aus dem Büro deren Rechte verschaffen, indem er ihr
Passwort zurücksetzt und sich anmeldet. Dafür gibt es Weg 2.

## 2. Geschäftsführung oder Administration → eine zweite Person mit denselben Rechten

Wer selbst Administrator oder Geschäftsführung ist, kann von einer anderen
Person mit Administrator- oder Geschäftsführungsrechten zurückgesetzt werden —
sonst genauso wie unter 1.

**Deshalb sollte es immer mindestens zwei solche Konten geben.** Gibt es nur
eines und dessen Passwort ist weg, bleibt nur der Notausgang.

## 3. Notausgang: niemand kommt mehr hinein

Zwei Möglichkeiten, je nachdem, wer die Software betreibt.

### 3a. Über den Plattformbetreiber

Der Betreiber der Plattform öffnet für die Firma einen Supportzugang
(zeitbegrenzt, mit Begründungspflicht, vollständig protokolliert) und setzt
darüber das Passwort einer Administration zurück. Für Kunden ist das der
richtige Weg.

### 3b. Direkt über die Datenbank

Nur für den, der die Datenbank selbst in der Hand hat — typischerweise der
Betreiber der eigenen Anlage. `api/scripts/notfall-passwort.mjs` **schreibt
nichts**; es druckt den SQL-Befehl, den ein Mensch bewusst ausführt. Das ist
Absicht: Ein Programm, das ungefragt Passwörter überschreibt, wäre eine
Hintertür.

```sh
cd api
printf '%s' 'EinNeuesPasswort1' \
  | node scripts/notfall-passwort.mjs F-000001 1 > notfall.sql
```

`F-000001` ist die Firmennummer, `1` die Personalnummer. Das Passwort geht
über die Standardeingabe und **nie** als Argument — Argumente stehen in der
Prozessliste und in der Shell-Historie, wo sie jeder mitlesen kann.

Dann die Datei ansehen, prüfen, ob Firma und Person stimmen, und ausführen:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f notfall.sql
rm notfall.sql
```

Der Befehl endet mit einer Kontrollabfrage vor dem `COMMIT`. Es muss genau
eine Zeile erscheinen und `must_change_password` muss `t` sein. Erscheint
keine Zeile, stimmt die Firmen- oder Personalnummer nicht — dann `ROLLBACK`
statt `COMMIT`, und nichts ist passiert.

Danach mit dem neuen Passwort anmelden; das Programm verlangt sofort ein
weiteres. Die Datei mit dem Befehl anschließend löschen, sie enthält den
Passworthash.

## Warum es keinen „Link per E-Mail" gibt

Weil die Software keinen Mailversand hat — kein SMTP, kein Anbieter, nichts.
Ein Knopf „Passwort per E-Mail zurücksetzen" wäre ein Versprechen, das nichts
dahinter hat. Solange das so ist, ist der ehrliche Weg der über das Büro.

Wer das ändern will, braucht drei Dinge, die heute fehlen: einen
Mailversanddienst mit Zugangsdaten, zustellbare Adressen für alle Mitarbeiter
(heute ist `users.email` freiwillig und oft leer), und ein Verfahren für
zeitlich begrenzte, einmalig gültige Rücksetzlinks. Das ist eine eigene
Ausbaustufe, keine Kleinigkeit nebenbei.
