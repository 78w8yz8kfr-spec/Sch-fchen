// Welche Bereiche der App stehen einer Firma offen?
//
// Darueber entscheidet ausschliesslich die Plattformverwaltung. Eine Firma
// kann ihre Bereiche nicht selbst an- und abschalten: was sie nutzen darf,
// gehoert zum verkauften Umfang und nicht in die Hand des Kunden.
//
// Die Liste kommt aus `module_catalog`, dem Katalog der Plattformverwaltung.
// Er ist die einzige Quelle: wer dort ein Modul ergaenzt, muss nichts weiter
// nachziehen. Zwei Merkmale des Katalogs steuern das Verhalten:
//
//   category = 'core'  gehoert zum unverzichtbaren Kern. Ohne Zeiterfassung
//                      ist Schaefchen kein Arbeitszeitnachweis mehr.
//   is_special = TRUE  muss von der Plattform je Firma freigegeben werden.
//
// Ein regulaerer Bereich gehoert zum Umfang und steht jeder Firma offen.

// Bereiche, die im Katalog stehen, aber noch nicht fachlich angebunden sind.
// Sie erscheinen als nicht freigegeben und lassen sich nicht einschalten,
// damit kein Schalter etwas verspricht, was es nicht gibt.
const NICHT_ANGEBUNDEN = new Set([
  "dguv",
  "electrical_special",
  "fleet",
  "advanced_exports",
  "integrations"
]);

// Bereiche, deren Abschalten die Zeitberechnung veraendern wuerde statt nur
// eine Ansicht auszublenden: die Zeiterfassung haengt an der
// Baustellenzuordnung. Sie bleiben fest, obwohl sie im Katalog stehen.
const RECHNET_MIT = new Set(["scheduling"]);

export function isSwitchable(row) {
  return row.category !== "core"
    && row.status === "active"
    && !RECHNET_MIT.has(row.module_key);
}

export function isIntegrated(moduleKey) {
  return !NICHT_ANGEBUNDEN.has(moduleKey);
}

// Gibt die Plattform den Bereich frei?
//
// Frueher galt das nur fuer Spezialmodule, alles andere stand jeder Firma
// ohnehin offen. Damit liess sich der Umfang gar nicht verkaufen: eine Firma
// ohne Urlaubsverwaltung im Vertrag sah sie trotzdem. Jetzt braucht jeder
// Bereich ausserhalb des Kerns eine Freigabe. Bestandsfirmen haben sie durch
// Migration 051 bekommen, neue erhalten sie beim Anlegen.
export function platformGrantsModule(row, entitlement) {
  if (row.category === "core") return true;
  if (entitlement?.entitlement_status === "permanent") return true;
  return entitlement?.entitlement_status === "trial"
    && (!entitlement.starts_at || new Date(entitlement.starts_at) <= new Date())
    && (!entitlement.ends_at || new Date(entitlement.ends_at) > new Date());
}

export function companyModuleDto(row, entitlement) {
  const integrated = isIntegrated(row.module_key);
  const granted = platformGrantsModule(row, entitlement);
  return {
    key: row.module_key,
    name: row.name,
    description: row.description || "",
    category: row.category,
    // Frueher kam hier ein Schalter der Firma hinzu. Er ist entfallen: eine
    // Firma soll ihren Umfang nicht selbst beschneiden koennen, und ein
    // abgeschalteter Bereich liess sich ohne die Plattform nicht mehr
    // zurueckholen. Die Zeilen in company_modules bleiben als Verlauf stehen,
    // gelesen werden sie nicht mehr.
    enabled: integrated && granted,
    platformGated: Boolean(row.is_special),
    status: entitlement?.entitlement_status || (row.is_special ? "inactive" : "included"),
    availableOnRequest: integrated && Boolean(row.is_special) && !granted,
    startsAt: entitlement?.starts_at ? new Date(entitlement.starts_at).toISOString() : null,
    endsAt: entitlement?.ends_at ? new Date(entitlement.ends_at).toISOString() : null
  };
}

export async function loadCompanyModules(client, context) {
  const result = await client.query(
    `SELECT catalog.module_key, catalog.name, catalog.description,
            catalog.category, catalog.status, catalog.is_special,
            entitlement.entitlement_status, entitlement.starts_at, entitlement.ends_at
     FROM module_catalog AS catalog
     LEFT JOIN company_module_entitlements AS entitlement
       ON entitlement.module_id = catalog.id AND entitlement.company_id = $1
     ORDER BY catalog.category, catalog.name`,
    [context.companyId]
  );
  // Nur Bereiche fuehren, die es in dieser Fassung wirklich gibt. Ein Eintrag
  // fuer etwas Ungebautes verspricht mehr, als die App halten kann.
  return result.rows
    .filter((row) => isSwitchable(row) && isIntegrated(row.module_key))
    .map((row) => companyModuleDto(row, row));
}
