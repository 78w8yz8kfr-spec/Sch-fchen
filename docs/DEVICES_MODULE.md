# Maschinen & Geräte

Stand: Fassung 0.44.3, Migrationen 095 bis 099.

## Fachlicher Ablauf

Ein Gerät wird einmal angelegt und erhält dabei einen aktiven QR-Token. Ein
normaler Etikett-Neudruck liest diesen Token erneut; nur „Code ersetzen“
widerruft ihn und erzeugt die nächste Generation. Es entsteht in beiden Fällen
kein neuer Gerätestammsatz.

Die Verwaltung führt dabei in einem Ablauf durch Inventarnummer, Bezeichnung,
Kategorie, Hersteller/Modell, Seriennummer, festen und aktuellen Besitzer,
Standort sowie optionale Kauf-, Prüf- und Fotodaten. Direkt nach der Anlage
erscheint das QR-Etikett; der Benutzer muss keine versteckte Folgeaktion
suchen. Fester und aktueller Besitzer können bereits bei der Erstanlage
voneinander abweichen.

Hat ein Gerät beiliegende Teile, legt derselbe Vorgang Hauptgerät und Teile
innerhalb einer Datenbanktransaktion an und verbindet sie mit einem
`device_set`. Akku, Ladegerät, Messgerät oder Koffer behalten jeweils eigene
Inventar- und Seriennummer, QR-Token, Besitzerrelation und Historie. Nach dem
Speichern steht ein gemeinsamer QR-Druckbogen bereit. Vorhandene Gegenstände
lassen sich später hinzufügen; das Entfernen aus dem Set verlangt einen Grund
und löscht weder Gegenstand noch Verlauf.

Auf Mobilgeräten prüft Schäfchen Pflichtfelder selbst und nennt dabei das
betroffene Einzelteil und Feld. Eine versehentlich zusätzlich erzeugte, noch
inhaltlich leere Teilezeile wird vor dem Speichern verworfen; teilweise
ausgefüllte Teile werden dagegen nie stillschweigend entfernt.

Beim Scan löst die API den Token innerhalb der angemeldeten Firma auf:

1. Ein freies Gerät wird in derselben Transaktion dem scanenden Mitarbeiter
   zugeordnet.
2. Beim eigenen Gerät erscheinen Rückgabe, Übergabe, Baustelle, Lager und
   Defektmeldung.
3. Bei fremdem festem oder aktuellem Besitz nennt Schäfchen den Besitzer und
   verlangt eine bestätigte Übernahme.
4. Defekte, gesperrte, verlorene, ausgemusterte oder nach Firmenregel wegen
   überfälliger Prüfung gesperrte Geräte werden nicht übernommen.
5. Unbekannte, widerrufene, manipulierte und fremdmandantige Tokens liefern
   dasselbe Ergebnis ohne preiszugeben, ob es den Gegenstand anderswo gibt.

Fester Besitzer und aktueller Besitzer stehen in getrennten zeitlich gültigen
`device_assignments`. Damit bleibt ein Gerät unter „Meine festen Geräte“
sichtbar, während „Aktuell bei“ einen anderen Mitarbeiter nennen kann.

## Datenmodell

| Bereich | Tabellen | Zweck |
| --- | --- | --- |
| Stamm | `device_categories`, `devices`, `device_battery_profiles` | Kategorien, Gerätedaten und eigenständige Akkuwerte |
| Orte und Sets | `device_locations`, `device_sets`, `device_set_items` | Lager, Werkstatt, Baustelle, Fahrzeug und vollständig bedienbare Koffer-/Set-Struktur |
| Besitz | `device_assignments`, `device_transfers` | feste Zuordnung, aktueller Besitz und idempotente Übergaben |
| QR | `device_qr_tokens` | zufällige Token-Generationen und Widerruf |
| Sicherheit | `device_defects`, `device_inspections`, `device_images` | Defekt, Reparatur, Prüfung, Protokollreferenz und Fotos |
| Inventur | `device_inventory_sessions`, `device_inventory_expected`, `device_inventory_scans` | Sollbestand, Scan und Abweichungsbericht |
| Verlauf | `device_history`, `device_notifications`, `device_settings` | Audit, gebündelte Hinweise und Firmenregeln |

Alle Relationen verwenden UUIDs. Mitarbeiter- und Ortsnamen werden nur beim
Lesen verbunden und nie als Besitzschlüssel gespeichert. Archivierte
Mitarbeiter bleiben deshalb in alten Übergaben lesbar. Fachliche Datensätze
werden archiviert oder ausgemustert, nicht hart gelöscht.

## Gleichzeitigkeit und Offlinebetrieb

Jede Übergabe trägt eine firmenweit eindeutige `client_operation_id` sowie die
erwartete `row_version` des Geräts. Die API sperrt den Gerätesatz mit
`FOR UPDATE`, prüft anschließend den aktuellen Besitz und schreibt Zuordnung,
Gerätestand, Übergabe, Benachrichtigung und Audit in einer Transaktion.

Zwei nahezu gleichzeitige Scans können daher nie zwei aktive Besitzer
erzeugen. Der erste gültige Vorgang gewinnt; der zweite erhält den danach
gültigen Besitzerstand. Wiederholt ein Client dieselbe Offline-Operation,
liefert die API das bereits gespeicherte Ergebnis. Eine Operation mit altem
Gerätestand wird als Konflikt behalten und nach erneutem Online-Scan durch den
Serverstand aufgelöst.

Die PWA speichert bekannte QR-Auflösungen und ausstehende Übergaben getrennt
nach Firmennummer und Benutzer-ID. Unbekannte Tokens werden offline nicht
erraten. Die Inventur benötigt derzeit eine Verbindung, weil ihre Soll-/Ist-
Entscheidung bewusst serverseitig erfolgt.

Die Livekamera verwendet die native QR-Erkennung, wenn der Browser sie
bereitstellt. Safari auf iPhone und iPad fällt automatisch auf den lokal
mitgelieferten, in einem Worker laufenden Decoder zurück. Derselbe Decoder
liest ausgewählte QR-Fotos. Es werden keine Kamerabilder an einen Fremddienst
übertragen; die Browserrichtlinie erlaubt die Kamera ausschließlich der
eigenen Schäfchen-Herkunft und erst nach Zustimmung des Benutzers.

## Rollen

| Rolle | Rechte |
| --- | --- |
| Monteur | scannen, übernehmen, zurückgeben, gezielt übergeben, eigenen/festen Besitz sehen, Defekt melden |
| Vorarbeiter | Monteurrechte, Geräte eigener betreuter Baustellen sehen, Übergaben nachvollziehen, Inventur durchführen |
| Büro und berechtigte Planung | vollständiger Bestand, Anlage/Bearbeitung/Ausmusterung, feste Besitzer, Kategorien, QR-Druck, Prüfungen, Reparaturen und Inventur |
| Plattformadministration | kein operativer Geräteendpunkt und keine automatische Firmeneinsicht |

Die API leitet `company_id` und `user_id` ausschließlich aus dem
HttpOnly-Sitzungscookie ab. Alle 18 fachlichen Tabellen besitzen RLS und
zusammengesetzte Fremdschlüssel über `(company_id, id)`. Der QR-Code selbst
enthält nur eine UUID in einer Schäfchen-Adresse.

## Prüfungen, Defekte und Hinweise

Eine Firma legt Vorwarnzeit, ungewöhnlich lange Ausleihdauer, Standardlager
und die optionale Sperre bei überfälliger Prüfung fest. Die Anzeige berechnet
„Prüfung bald“, „Prüfung überfällig“ und den wirksamen Sperrstatus aus dem
Termin. Eine nicht sicher weiterverwendbare Defektmeldung sperrt sofort;
„Reparatur abschließen“ löst die Meldung mit Pflichtvermerk und bewertet den
Besitzstatus erneut.

Hinweise entstehen für Fremdübernahme und Rückgabe eines festen Geräts,
Defekte, fällige/überfällige Prüfungen, fehlende Inventargegenstände und lange
Ausleihen. Die Schäfchen-Glocke bündelt sie zu einem Eintrag; im Gerätemodul
bleiben die einzelnen Hinweise nachvollziehbar.

## Abnahme

Automatisiert geprüft werden Stammanlage, QR-Ausgabe/-Rotation, automatische
und bestätigte Übernahme, Rückgabe, Benachrichtigung, Akkuübergabe, Defekt und
Reparatur, Prüfsperre, paralleler Scan, Offline-Idempotenz, Inventur,
Mitarbeiterarchivierung, Ausmusterung, Rollen und fremder Mandant. Migration
095 besitzt einen eigenen SQL-Abnahmetest; der PostgreSQL-Integrationstest
durchläuft die HTTP-Abläufe mit echten Sitzungen und RLS-Rolle.

Für die Geräteabnahme vor Ort bleiben zusätzlich Fokus, Etikettengröße und
Scanabstand mit den tatsächlich eingesetzten Smartphones, Kameras und
Druckern zu prüfen; diese Hardwaremerkmale lassen sich im Repository nicht
simulieren.
