// Bereiche, die ein Betrieb selbst an- und abschalten kann.
//
// `platformGated` trennt die beiden Ebenen: ein Spezialmodul muss zuerst von
// der Plattform freigegeben werden und laesst sich danach von der Firma
// zusaetzlich abschalten. Ein regulaerer Bereich gehoert zum Umfang und ist
// eingeschaltet, solange die Firma ihn nicht abschaltet.
//
// Der Kern fehlt hier bewusst. Zeiterfassung, Mitarbeiter, Baustellen und
// Anmeldung sind keine Module. Einsatzplanung und Stundenkonten bleiben
// ebenfalls draussen: die Sollzeit haengt am Feiertagskalender und die
// Zeiterfassung an der Baustellenzuordnung: ein Schalter dort wuerde die
// Zeitberechnung veraendern statt nur eine Ansicht auszublenden.
export const COMPANY_MODULES = [
  {
    key: "vde",
    name: "VDE-Prüfungen",
    description: "Prüfungen elektrischer Anlagen und Betriebsmittel",
    integrated: true,
    platformGated: true
  },
  {
    key: "site_reports",
    name: "Baustellenberichte",
    description: "Tages- und Abnahmeberichte mit Unterschrift auf der Baustelle",
    integrated: true,
    platformGated: false
  },
  {
    key: "site_documents",
    name: "Baustellenakte",
    description: "Fotos, Dokumente, Material und Notizen je Baustelle",
    integrated: true,
    platformGated: false
  },
  {
    key: "absences",
    name: "Abwesenheiten",
    description: "Urlaub und Abwesenheit beantragen und freigeben",
    integrated: true,
    platformGated: false
  },
  {
    key: "site_qr",
    name: "Baustellenlink und QR",
    description: "Zugang zu einer Baustelle über Link oder QR-Code",
    integrated: true,
    platformGated: false
  }
];

// Gibt die Plattform den Bereich frei? Nur Spezialmodule brauchen das.
export function platformGrantsModule(definition, entitlement) {
  if (!definition.platformGated) return true;
  if (entitlement?.entitlement_status === "permanent") return true;
  return entitlement?.entitlement_status === "trial"
    && (!entitlement.starts_at || new Date(entitlement.starts_at) <= new Date())
    && (!entitlement.ends_at || new Date(entitlement.ends_at) > new Date());
}

export function companyModuleDto(definition, entitlement, companySwitch) {
  const granted = platformGrantsModule(definition, entitlement);
  // Ohne eigenen Eintrag gilt der Bereich als eingeschaltet. Ein Betrieb, der
  // den Schalter nie angefasst hat, soll alles nutzen koennen, was ihm zusteht.
  const switchedOn = companySwitch ? companySwitch.is_enabled : true;
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    available: definition.integrated && granted,
    enabled: definition.integrated && granted && switchedOn,
    platformGated: definition.platformGated,
    status: entitlement?.entitlement_status || (definition.platformGated ? "inactive" : "included"),
    availableOnRequest: definition.platformGated && !granted,
    rowVersion: companySwitch ? Number(companySwitch.row_version) : 0,
    changedAt: companySwitch?.updated_at ? new Date(companySwitch.updated_at).toISOString() : null,
    startsAt: entitlement?.starts_at ? new Date(entitlement.starts_at).toISOString() : null,
    endsAt: entitlement?.ends_at ? new Date(entitlement.ends_at).toISOString() : null
  };
}

export async function loadCompanyModules(client, context) {
  const [entitlements, switches] = await Promise.all([
    client.query(
      `SELECT catalog.module_key, entitlement.entitlement_status,
              entitlement.starts_at, entitlement.ends_at
       FROM module_catalog AS catalog
       LEFT JOIN company_module_entitlements AS entitlement
         ON entitlement.module_id = catalog.id AND entitlement.company_id = $1`,
      [context.companyId]
    ),
    client.query(
      `SELECT module_key, is_enabled, row_version, updated_at
       FROM company_modules
       WHERE company_id = $1`,
      [context.companyId]
    )
  ]);
  const freigaben = new Map(entitlements.rows.map((row) => [row.module_key, row]));
  const schalter = new Map(switches.rows.map((row) => [row.module_key, row]));
  return COMPANY_MODULES.map((definition) => companyModuleDto(
    definition,
    freigaben.get(definition.key),
    schalter.get(definition.key)
  ));
}
