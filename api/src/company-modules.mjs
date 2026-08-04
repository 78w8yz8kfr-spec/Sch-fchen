// Bereiche, die ein Betrieb selbst an- und abschalten kann.
//
// Die Liste kommt aus `module_catalog`, dem Katalog der Plattformverwaltung.
// Er ist die einzige Quelle: wer dort ein Modul ergaenzt, muss nichts weiter
// nachziehen. Zwei Merkmale des Katalogs steuern das Verhalten:
//
//   category = 'core'  gehoert zum unverzichtbaren Kern und ist niemals
//                      abschaltbar. Ohne Zeiterfassung ist Schaefchen kein
//                      Arbeitszeitnachweis mehr.
//   is_special = TRUE  muss zuerst von der Plattform freigegeben werden. Die
//                      Firma kann es danach zusaetzlich abschalten.
//
// Ein regulaerer Bereich gehoert zum Umfang und ist eingeschaltet, solange die
// Firma ihn nicht abschaltet.

// Bereiche, die im Katalog stehen, aber noch nicht fachlich angebunden sind.
// Sie erscheinen als nicht freigegeben und lassen sich nicht einschalten,
// damit kein Schalter etwas verspricht, was es nicht gibt.
const NICHT_ANGEBUNDEN = new Set([
  "dguv",
  "electrical_special",
  "fleet",
  "apprentice_reports",
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

// Gibt die Plattform den Bereich frei? Nur Spezialmodule brauchen das.
export function platformGrantsModule(row, entitlement) {
  if (!row.is_special) return true;
  if (entitlement?.entitlement_status === "permanent") return true;
  return entitlement?.entitlement_status === "trial"
    && (!entitlement.starts_at || new Date(entitlement.starts_at) <= new Date())
    && (!entitlement.ends_at || new Date(entitlement.ends_at) > new Date());
}

export function companyModuleDto(row, entitlement, companySwitch) {
  const integrated = isIntegrated(row.module_key);
  const granted = platformGrantsModule(row, entitlement);
  // Ohne eigenen Eintrag gilt der Bereich als eingeschaltet. Ein Betrieb, der
  // den Schalter nie angefasst hat, soll alles nutzen koennen, was ihm zusteht.
  const switchedOn = companySwitch ? companySwitch.is_enabled : true;
  return {
    key: row.module_key,
    name: row.name,
    description: row.description || "",
    category: row.category,
    available: integrated && granted,
    enabled: integrated && granted && switchedOn,
    platformGated: Boolean(row.is_special),
    status: entitlement?.entitlement_status || (row.is_special ? "inactive" : "included"),
    availableOnRequest: integrated && Boolean(row.is_special) && !granted,
    rowVersion: companySwitch ? Number(companySwitch.row_version) : 0,
    changedAt: companySwitch?.updated_at ? new Date(companySwitch.updated_at).toISOString() : null,
    startsAt: entitlement?.starts_at ? new Date(entitlement.starts_at).toISOString() : null,
    endsAt: entitlement?.ends_at ? new Date(entitlement.ends_at).toISOString() : null
  };
}

export async function loadCompanyModules(client, context) {
  const result = await client.query(
    `SELECT catalog.module_key, catalog.name, catalog.description,
            catalog.category, catalog.status, catalog.is_special,
            entitlement.entitlement_status, entitlement.starts_at, entitlement.ends_at,
            company_switch.is_enabled, company_switch.row_version, company_switch.updated_at
     FROM module_catalog AS catalog
     LEFT JOIN company_module_entitlements AS entitlement
       ON entitlement.module_id = catalog.id AND entitlement.company_id = $1
     LEFT JOIN company_modules AS company_switch
       ON company_switch.company_id = $1 AND company_switch.module_key = catalog.module_key
     ORDER BY catalog.category, catalog.name`,
    [context.companyId]
  );
  // Nur Bereiche zeigen, die es in dieser Fassung wirklich gibt. Ein Schalter
  // fuer etwas Ungebautes verspricht mehr, als die App halten kann.
  return result.rows
    .filter((row) => isSwitchable(row) && isIntegrated(row.module_key))
    .map((row) => companyModuleDto(row, row, row.is_enabled === null ? null : row));
}
