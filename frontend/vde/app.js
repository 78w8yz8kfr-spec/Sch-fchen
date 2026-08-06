(() => {
  "use strict";

  const VISUAL_CHECKS = [
    ["electric_shock_protection", "Schutz gegen elektrischen Schlag vorhanden"],
    ["protective_conductor", "Schutzleiter und Potentialausgleich vorhanden"],
    ["equipment_selection", "Leitungen und Betriebsmittel richtig ausgewählt"],
    ["circuit_labelling", "Stromkreise eindeutig beschriftet"],
    ["rcd_test_button", "RCD-Prüftaste betätigt"],
    ["phase_sequence", "Drehfeld geprüft"],
    ["polarity", "Polung geprüft"],
    ["disconnection_conditions", "Abschaltbedingungen geprüft"]
  ];
  const PROTECTION_TYPES = [
    ["mcb", "Leitungsschutzschalter (LS)"],
    ["rcbo", "FI/LS"],
    ["fuse_nh", "NH-Sicherung"],
    ["fuse_diazed", "Diazed-Sicherung"],
    ["fuse_neozed", "Neozed-Sicherung"],
    ["other", "Anderes Schutzorgan"]
  ];
  const RCD_TYPES = ["A", "F", "B", "AC"];
  const RCD_CHARACTERISTICS = [
    "unverzögert",
    "G / kurzzeitverzögert",
    "S / selektiv"
  ];
  const BREAKER_CHARACTERISTICS = ["B", "C", "D", "K", "Z"];
  const CHECK_OPTIONS = [
    ["not_checked", "Nicht geprüft"],
    ["ok", "i. O."],
    ["not_ok", "n. i. O."]
  ];
  const LEGACY_STORAGE_KEY = "vde-protokoll-v15-sichtbarkeit-reihenfolge";
  const FUSE_TRIP_CURRENT = {
    B6: 30,
    B10: 50,
    B13: 65,
    B16: 80,
    B20: 100,
    B25: 125,
    B32: 160,
    B40: 200,
    C6: 60,
    C10: 100,
    C13: 130,
    C16: 160,
    C20: 200,
    C25: 250,
    C32: 320,
    C40: 400,
    D6: 120,
    D10: 200,
    D13: 260,
    D16: 320,
    D20: 400,
    D25: 500,
    D32: 640,
    D40: 800
  };

  const query = new URLSearchParams(window.location.search);
  const constructionSiteId = query.get("constructionSiteId");
  const accessDate = query.get("date") || localDateKey();
  let selectedInspectionId = query.get("inspectionId");
  let vdeContext = null;
  let currentInspection = null;
  let clientInspectionId = createId();
  let localDraftTimer = null;
  let localDraftDirty = false;
  let signatureDrawn = false;
  let drawingSignature = false;

  const elements = {
    loading: document.querySelector("#loading-state"),
    fatal: document.querySelector("#fatal-state"),
    fatalMessage: document.querySelector("#fatal-message"),
    app: document.querySelector("#vde-app"),
    backLink: document.querySelector("#back-link"),
    companyLogo: document.querySelector("#company-logo"),
    companyName: document.querySelector("#company-name"),
    customerName: document.querySelector("#customer-name"),
    projectName: document.querySelector("#project-name"),
    siteName: document.querySelector("#site-name"),
    siteAddress: document.querySelector("#site-address"),
    inspectionList: document.querySelector("#inspection-list"),
    newInspection: document.querySelector("#new-inspection"),
    legacyImportPanel: document.querySelector("#legacy-import-panel"),
    legacyImportForm: document.querySelector("#legacy-import-form"),
    legacyJsonFile: document.querySelector("#legacy-json-file"),
    legacyPdfFile: document.querySelector("#legacy-pdf-file"),
    legacyInspector: document.querySelector("#legacy-inspector"),
    legacyImportSubmit: document.querySelector("#legacy-import-submit"),
    legacyLocalImport: document.querySelector("#legacy-local-import"),
    legacyImportMessage: document.querySelector("#legacy-import-message"),
    inspectionForm: document.querySelector("#inspection-form"),
    inspectionFields: document.querySelector("#inspection-fields"),
    inspectionNumber: document.querySelector("#inspection-number"),
    editorTitle: document.querySelector("#editor-title"),
    inspectionStatus: document.querySelector("#inspection-status"),
    inspectionName: document.querySelector("#inspection-name"),
    inspectionDate: document.querySelector("#inspection-date"),
    inspectionInspector: document.querySelector("#inspection-inspector"),
    networkType: document.querySelector("#network-type"),
    nominalVoltage: document.querySelector("#nominal-voltage"),
    kindInitial: document.querySelector("#kind-initial"),
    kindRecurring: document.querySelector("#kind-recurring"),
    kindAlteration: document.querySelector("#kind-alteration"),
    visualChecks: document.querySelector("#visual-checks"),
    incomingDesignation: document.querySelector("#incoming-designation"),
    incomingLocation: document.querySelector("#incoming-location"),
    incomingProtection: document.querySelector("#incoming-protection"),
    incomingSource: document.querySelector("#incoming-source"),
    incomingCable: document.querySelector("#incoming-cable"),
    incomingCores: document.querySelector("#incoming-cores"),
    incomingCrossSection: document.querySelector("#incoming-cross-section"),
    circuitDirectoryIncluded: document.querySelector("#circuit-directory-included"),
    detailedInsulation: document.querySelector("#detailed-insulation"),
    addDistribution: document.querySelector("#add-distribution"),
    distributionList: document.querySelector("#distribution-list"),
    equipmentManufacturer: document.querySelector("#equipment-manufacturer"),
    equipmentType: document.querySelector("#equipment-type"),
    equipmentSerial: document.querySelector("#equipment-serial"),
    equipmentCalibration: document.querySelector("#equipment-calibration"),
    inspectionResult: document.querySelector("#inspection-result"),
    nextInspectionDate: document.querySelector("#next-inspection-date"),
    inspectionDefects: document.querySelector("#inspection-defects"),
    overallEvaluation: document.querySelector("#overall-evaluation"),
    evaluationDetails: document.querySelector("#evaluation-details"),
    signatureSection: document.querySelector("#signature-section"),
    signaturePad: document.querySelector("#signature-pad"),
    clearSignature: document.querySelector("#clear-signature"),
    saveInspection: document.querySelector("#save-inspection"),
    completeInspection: document.querySelector("#complete-inspection"),
    openPdf: document.querySelector("#open-pdf"),
    saveState: document.querySelector("#save-state"),
    localDraftState: document.querySelector("#local-draft-state"),
    formMessage: document.querySelector("#form-message")
  };
  const signatureContext = elements.signaturePad.getContext("2d");

  function localDateKey(date = new Date()) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }

  function createActionButton(label, action, options = {}) {
    const button = createElement(
      "button",
      options.className || "icon-button",
      label
    );
    button.type = "button";
    button.dataset.action = action;
    if (options.title) {
      button.title = options.title;
      button.setAttribute("aria-label", options.title);
    }
    return button;
  }

  function createOptionsSelect(options, selectedValue) {
    const select = document.createElement("select");
    options.forEach((optionData) => {
      const [value, label = value] = Array.isArray(optionData)
        ? optionData
        : [optionData, optionData];
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === selectedValue;
      select.append(option);
    });
    return select;
  }

  function createField(labelText, fieldName, value = "", options = {}) {
    const label = createElement("label", `field ${options.wide ? "field--wide" : ""}`.trim());
    const caption = createElement("span", "", labelText);
    let control;
    if (options.options) {
      control = createOptionsSelect(options.options, value ?? "");
    } else if (options.textarea) {
      control = document.createElement("textarea");
      control.rows = options.rows || 3;
      control.value = value ?? "";
    } else {
      control = document.createElement("input");
      control.type = options.type || "text";
      control.value = value ?? "";
      if (options.inputMode) control.inputMode = options.inputMode;
      if (options.placeholder) control.placeholder = options.placeholder;
    }
    control.dataset.field = fieldName;
    if (options.maxLength) control.maxLength = options.maxLength;
    label.append(caption, control);
    if (options.visibility) label.dataset.visibility = options.visibility;
    return label;
  }

  function createCheckboxField(labelText, fieldName, checked, visibility = "") {
    const label = createElement("label", "check-grid__item");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.dataset.field = fieldName;
    label.append(input, document.createTextNode(labelText));
    if (visibility) label.dataset.visibility = visibility;
    return label;
  }

  function defaultMeasurements() {
    return {
      rpe: "",
      riso: "",
      zi: "",
      zs: "",
      ik: "",
      rcdTripTime: "",
      rcdTripCurrent: "",
      risoL1Pe: "",
      risoL2Pe: "",
      risoL3Pe: "",
      risoNPe: ""
    };
  }

  function defaultProtection(type = "mcb") {
    return {
      type,
      characteristic: ["mcb", "rcbo"].includes(type) ? "B" : "",
      ratedCurrent: "16",
      designation: "",
      rcdType: type === "rcbo" ? "A" : "",
      rcdCharacteristic: type === "rcbo" ? "unverzögert" : "",
      ratedResidualCurrent: type === "rcbo" ? "30" : "",
      testButton: false
    };
  }

  function defaultCircuit(type = "mcb") {
    return {
      clientId: createId(),
      name: "",
      cableType: "",
      cores: "",
      crossSection: "",
      protectiveDevice: defaultProtection(type),
      measurements: defaultMeasurements(),
      note: ""
    };
  }

  function defaultRcd() {
    return {
      clientId: createId(),
      name: "FI 1",
      type: "A",
      characteristic: "unverzögert",
      ratedCurrent: "40",
      ratedResidualCurrent: "30",
      testButton: false,
      circuits: [defaultCircuit()]
    };
  }

  function defaultDistribution(number = 1) {
    return {
      clientId: createId(),
      name: number === 1 ? "UV EG" : `UV ${number}`,
      source: "Hausanschlusskasten",
      feedCableType: "",
      feedCores: "",
      feedCrossSection: "",
      feedProtection: "",
      location: "",
      rcds: [defaultRcd()],
      directCircuits: []
    };
  }

  function defaultProtocol() {
    return {
      schemaVersion: 1,
      networkType: "TN-S",
      nominalVoltage: "230/400 V",
      inspectionKinds: {
        initial: true,
        recurring: false,
        alteration: false
      },
      visualChecks: Object.fromEntries(
        VISUAL_CHECKS.map(([key]) => [key, "not_checked"])
      ),
      incomingSupply: {
        designation: "HAK",
        location: "",
        upstreamProtection: "",
        source: "",
        cableType: "",
        cores: "",
        crossSection: ""
      },
      circuitDirectoryIncluded: false,
      detailedInsulationMeasurement: false,
      distributions: [defaultDistribution()],
      testEquipment: {
        manufacturer: "",
        type: "",
        serialNumber: "",
        calibrationValidUntil: ""
      },
      defects: "",
      result: "ok",
      nextInspectionDate: ""
    };
  }

  function normalizeProtocol(protocol) {
    const fallback = defaultProtocol();
    if (!protocol || protocol.schemaVersion !== 1) return fallback;
    return {
      ...fallback,
      ...protocol,
      inspectionKinds: {
        ...fallback.inspectionKinds,
        ...(protocol.inspectionKinds || {})
      },
      visualChecks: {
        ...fallback.visualChecks,
        ...(protocol.visualChecks || {})
      },
      incomingSupply: {
        ...fallback.incomingSupply,
        ...(protocol.incomingSupply || {})
      },
      testEquipment: {
        ...fallback.testEquipment,
        ...(protocol.testEquipment || {})
      },
      distributions: Array.isArray(protocol.distributions)
        ? protocol.distributions.map((distributionInput) => {
          const distribution = distributionInput
            && typeof distributionInput === "object"
            && !Array.isArray(distributionInput)
            ? distributionInput
            : {};
          return {
            ...defaultDistribution(),
            ...distribution,
            clientId: distribution.clientId || createId(),
            rcds: Array.isArray(distribution.rcds)
              ? distribution.rcds.map((rcdInput) => {
                const rcd = rcdInput
                  && typeof rcdInput === "object"
                  && !Array.isArray(rcdInput)
                  ? rcdInput
                  : {};
                return {
                  ...defaultRcd(),
                  ...rcd,
                  clientId: rcd.clientId || createId(),
                  circuits: Array.isArray(rcd.circuits)
                    ? rcd.circuits.map(normalizeCircuit)
                    : []
                };
              })
              : [],
            directCircuits: Array.isArray(distribution.directCircuits)
              ? distribution.directCircuits.map(normalizeCircuit)
              : []
          };
        })
        : []
    };
  }

  function normalizeCircuit(circuit) {
    const fallback = defaultCircuit();
    return {
      ...fallback,
      ...(circuit || {}),
      clientId: circuit?.clientId || createId(),
      protectiveDevice: {
        ...fallback.protectiveDevice,
        ...(circuit?.protectiveDevice || {})
      },
      measurements: {
        ...fallback.measurements,
        ...(circuit?.measurements || {})
      }
    };
  }

  async function requestJson(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        credentials: "include",
        ...options,
        headers: {
          // Ohne diese Angabe gilt der Aufrufer als veraltet, sobald die
          // Plattform ein Pflichtupdate setzt: der Server kann eine fehlende
          // Fassung nicht von einer zu alten unterscheiden. Das VDE-Modul waere
          // dann als einziges vollstaendig ausgefallen.
          "X-Schaefchen-Version": "0.42.26",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      const error = new Error("Der Server ist momentan nicht erreichbar.");
      error.network = true;
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        body.error?.message || "Die Anfrage ist fehlgeschlagen."
      );
      error.status = response.status;
      error.code = body.error?.code;
      throw error;
    }
    return body;
  }

  function apiPath(path) {
    return `../api/v1/vde${path}`;
  }

  function showFatal(message) {
    elements.loading.hidden = true;
    elements.app.hidden = true;
    elements.fatalMessage.textContent = message;
    elements.fatal.hidden = false;
  }

  function inspectorName(userId) {
    return vdeContext?.inspectors.find((inspector) => inspector.id === userId)?.name
      || "Prüfer";
  }

  function populateInspectorSelect(select, selectedId) {
    select.replaceChildren();
    (vdeContext?.inspectors || []).forEach((inspector) => {
      const option = document.createElement("option");
      option.value = inspector.id;
      option.textContent = `${inspector.name} · ${inspector.personnelNumber}`;
      option.selected = inspector.id === selectedId;
      select.append(option);
    });
    if (!select.value && select.options.length > 0) {
      const viewerOption = [...select.options].find(
        (option) => option.value === vdeContext.viewer.id
      );
      (viewerOption || select.options[0]).selected = true;
    }
  }

  function renderContext() {
    elements.companyLogo.src = vdeContext.company.logoUrl
      ? vdeContext.company.logoUrl.replace(/^\.\//, "../")
      : "../assets/company-logos/schaaf-elektro.webp";
    elements.companyName.textContent =
      vdeContext.company.displayName || vdeContext.company.legalName;
    elements.customerName.textContent = vdeContext.customer.name;
    elements.projectName.textContent = [
      vdeContext.project.number,
      vdeContext.project.name
    ].filter(Boolean).join(" · ");
    elements.siteName.textContent = [
      vdeContext.site.number,
      vdeContext.site.name
    ].filter(Boolean).join(" · ");
    elements.siteAddress.textContent = vdeContext.site.address || "Keine Adresse";
    elements.backLink.href = `../?date=${encodeURIComponent(accessDate)}`;
    elements.newInspection.hidden = !vdeContext.permissions.create;
    elements.legacyImportPanel.hidden = !vdeContext.permissions.importLegacy;
    if (vdeContext.permissions.importLegacy) {
      try {
        elements.legacyLocalImport.hidden = !window.localStorage.getItem(
          LEGACY_STORAGE_KEY
        );
      } catch {
        elements.legacyLocalImport.hidden = true;
      }
    }
    populateInspectorSelect(elements.legacyInspector, vdeContext.viewer.id);
  }

  function inspectionHref(inspectionId) {
    const url = new URL(window.location.href);
    url.searchParams.set("constructionSiteId", constructionSiteId);
    url.searchParams.set("inspectionId", inspectionId);
    url.searchParams.set("date", accessDate);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  function renderInspectionList() {
    elements.inspectionList.replaceChildren();
    if (vdeContext.inspections.length === 0) {
      elements.inspectionList.append(
        document.querySelector("#empty-inspections-template").content.cloneNode(true)
      );
      return;
    }
    vdeContext.inspections.forEach((inspection) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const titleRow = createElement("div", "inspection-list__title");
      const title = createElement("strong", "", inspection.name);
      const badge = createElement(
        "small",
        `status-chip ${inspection.status === "completed" ? "status-chip--completed" : ""}`.trim(),
        inspection.status === "completed" ? "Fertig" : "Entwurf"
      );
      const meta = createElement(
        "span",
        "",
        [
          inspection.number,
          formatDate(inspection.inspectionDate),
          inspection.inspectorName,
          inspection.sourceMode === "legacy_v15" ? "V15-Import" : null
        ].filter(Boolean).join(" · ")
      );
      link.href = inspectionHref(inspection.id);
      if (inspection.id === selectedInspectionId) {
        link.setAttribute("aria-current", "page");
      }
      titleRow.append(title, badge);
      link.append(titleRow, meta);
      item.append(link);
      elements.inspectionList.append(item);
    });
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("de-DE").format(
      new Date(`${value}T12:00:00`)
    );
  }

  function renderVisualChecks(protocol) {
    elements.visualChecks.replaceChildren();
    VISUAL_CHECKS.forEach(([key, labelText]) => {
      const row = createElement("div", "visual-check");
      const label = createElement("label", "", labelText);
      const select = createOptionsSelect(
        CHECK_OPTIONS,
        protocol.visualChecks[key] || "not_checked"
      );
      select.dataset.visualCheck = key;
      row.append(label, select);
      elements.visualChecks.append(row);
    });
  }

  function createCircuitCard(circuitInput, hasParentRcd) {
    const circuit = normalizeCircuit(circuitInput);
    const card = createElement("article", "circuit-card");
    card.dataset.circuitId = circuit.clientId;
    card.dataset.hasParentRcd = String(hasParentRcd);

    const heading = createElement("div", "circuit-heading");
    const titleGroup = document.createElement("div");
    const title = createElement(
      "strong",
      "circuit-card__title",
      circuit.name || "Unbenannter Stromkreis"
    );
    const hint = createElement(
      "span",
      "",
      hasParentRcd ? "RCD vorgeschaltet" : "Direkter Abgang"
    );
    const actions = createElement("div", "circuit-actions");
    actions.append(
      createActionButton("↑", "circuit-up", { title: "Stromkreis nach oben" }),
      createActionButton("↓", "circuit-down", { title: "Stromkreis nach unten" }),
      createActionButton("×", "circuit-delete", {
        className: "icon-button icon-button--danger",
        title: "Stromkreis entfernen"
      })
    );
    titleGroup.append(title, hint);
    heading.append(titleGroup, actions);

    const details = createElement("div", "field-grid circuit-fields");
    details.append(
      createField(
        "Stromkreis / Sicherung",
        "name",
        circuit.name,
        { wide: true, maxLength: 200, placeholder: "z. B. F1 Steckdosen Küche" }
      ),
      createField("Leitung / Kabeltyp", "cableType", circuit.cableType, {
        maxLength: 100,
        placeholder: "z. B. NYM-J"
      }),
      createField("Adernzahl", "cores", circuit.cores, {
        maxLength: 20,
        inputMode: "numeric"
      }),
      createField("Querschnitt mm²", "crossSection", circuit.crossSection, {
        inputMode: "decimal"
      }),
      createField(
        "Schutzorgan",
        "protectiveDevice.type",
        circuit.protectiveDevice.type,
        { options: PROTECTION_TYPES }
      ),
      createField(
        "Charakteristik",
        "protectiveDevice.characteristic",
        circuit.protectiveDevice.characteristic,
        { options: BREAKER_CHARACTERISTICS, visibility: "breaker" }
      ),
      createField(
        "Nennstrom A",
        "protectiveDevice.ratedCurrent",
        circuit.protectiveDevice.ratedCurrent,
        { inputMode: "decimal" }
      ),
      createField(
        "Bezeichnung / Baugröße",
        "protectiveDevice.designation",
        circuit.protectiveDevice.designation,
        {
          maxLength: 120,
          placeholder: "z. B. NH 00 gG",
          visibility: "fuse-or-other"
        }
      ),
      createField(
        "FI/LS-Typ",
        "protectiveDevice.rcdType",
        circuit.protectiveDevice.rcdType || "A",
        { options: RCD_TYPES, visibility: "rcbo" }
      ),
      createField(
        "FI/LS-Charakteristik",
        "protectiveDevice.rcdCharacteristic",
        circuit.protectiveDevice.rcdCharacteristic || "unverzögert",
        { options: RCD_CHARACTERISTICS, visibility: "rcbo" }
      ),
      createField(
        "FI/LS IΔn mA",
        "protectiveDevice.ratedResidualCurrent",
        circuit.protectiveDevice.ratedResidualCurrent || "30",
        { inputMode: "decimal", visibility: "rcbo" }
      )
    );
    const protectionChecks = createElement("div", "check-grid");
    protectionChecks.append(
      createCheckboxField(
        "FI/LS-Prüftaste bestätigt",
        "protectiveDevice.testButton",
        circuit.protectiveDevice.testButton,
        "rcbo"
      )
    );

    const measurements = createElement("div", "measurement-grid");
    measurements.append(
      createField("RPE Ω", "measurements.rpe", circuit.measurements.rpe, {
        inputMode: "decimal"
      }),
      createField("RISO MΩ", "measurements.riso", circuit.measurements.riso, {
        inputMode: "decimal"
      }),
      createField("Zi Ω", "measurements.zi", circuit.measurements.zi, {
        inputMode: "decimal"
      }),
      createField("Zs Ω", "measurements.zs", circuit.measurements.zs, {
        inputMode: "decimal"
      }),
      createField("Ik A", "measurements.ik", circuit.measurements.ik, {
        inputMode: "decimal"
      }),
      createField(
        "RCD-Auslösezeit ms",
        "measurements.rcdTripTime",
        circuit.measurements.rcdTripTime,
        { inputMode: "decimal", visibility: "rcd-measurement" }
      ),
      createField(
        "RCD-Auslösestrom mA",
        "measurements.rcdTripCurrent",
        circuit.measurements.rcdTripCurrent,
        { inputMode: "decimal", visibility: "rcd-measurement" }
      ),
      createField(
        "RISO L1-PE MΩ",
        "measurements.risoL1Pe",
        circuit.measurements.risoL1Pe,
        { inputMode: "decimal", visibility: "detailed-insulation" }
      ),
      createField(
        "RISO L2-PE MΩ",
        "measurements.risoL2Pe",
        circuit.measurements.risoL2Pe,
        { inputMode: "decimal", visibility: "detailed-insulation" }
      ),
      createField(
        "RISO L3-PE MΩ",
        "measurements.risoL3Pe",
        circuit.measurements.risoL3Pe,
        { inputMode: "decimal", visibility: "detailed-insulation" }
      ),
      createField(
        "RISO N-PE MΩ",
        "measurements.risoNPe",
        circuit.measurements.risoNPe,
        { inputMode: "decimal", visibility: "detailed-insulation" }
      )
    );
    const note = createField(
      "Bemerkung",
      "note",
      circuit.note,
      { wide: true, maxLength: 500 }
    );
    const evaluation = createElement(
      "div",
      "circuit-evaluation",
      "Bewertung wird berechnet."
    );
    evaluation.dataset.circuitEvaluation = circuit.clientId;
    card.append(heading, details, protectionChecks, measurements, note, evaluation);
    updateCircuitVisibility(card);
    return card;
  }

  function createRcdCard(rcdInput) {
    const rcd = {
      ...defaultRcd(),
      ...rcdInput,
      clientId: rcdInput.clientId || createId(),
      circuits: (rcdInput.circuits || []).map(normalizeCircuit)
    };
    const card = createElement("article", "rcd-card");
    card.dataset.rcdId = rcd.clientId;
    const heading = createElement("div", "rcd-heading");
    const title = createElement(
      "strong",
      "rcd-card__title",
      rcd.name || "FI/RCD"
    );
    const actions = createElement("div", "rcd-actions");
    actions.append(
      createActionButton("▾", "rcd-collapse", { title: "FI/RCD ein- oder ausklappen" }),
      createActionButton("↑", "rcd-up", { title: "FI/RCD nach oben" }),
      createActionButton("↓", "rcd-down", { title: "FI/RCD nach unten" }),
      createActionButton("×", "rcd-delete", {
        className: "icon-button icon-button--danger",
        title: "FI/RCD entfernen"
      })
    );
    heading.append(title, actions);
    const fields = createElement("div", "field-grid rcd-fields");
    fields.append(
      createField("Bezeichnung", "name", rcd.name, { maxLength: 120 }),
      createField("Typ", "type", rcd.type || "A", { options: RCD_TYPES }),
      createField(
        "Charakteristik",
        "characteristic",
        rcd.characteristic || "unverzögert",
        { options: RCD_CHARACTERISTICS }
      ),
      createField("Bemessungsstrom In A", "ratedCurrent", rcd.ratedCurrent, {
        inputMode: "decimal"
      }),
      createField(
        "Bemessungsdifferenzstrom IΔn mA",
        "ratedResidualCurrent",
        rcd.ratedResidualCurrent,
        { inputMode: "decimal" }
      )
    );
    const checks = createElement("div", "check-grid rcd-checks");
    checks.append(
      createCheckboxField("Prüftaste bestätigt", "testButton", rcd.testButton)
    );
    const subsection = createElement("div", "subsection");
    const subsectionHeading = createElement("div", "subsection-heading");
    subsectionHeading.append(
      createElement("strong", "", "Stromkreise nach diesem FI/RCD"),
      createActionButton("+ Stromkreis", "rcd-add-circuit", {
        className: "button button--small"
      })
    );
    const circuits = createElement("div", "circuit-list");
    circuits.dataset.circuitList = "rcd";
    rcd.circuits.forEach((circuit) => {
      circuits.append(createCircuitCard(circuit, true));
    });
    if (rcd.circuits.length === 0) {
      circuits.append(createElement("div", "empty-card", "Noch kein Stromkreis nach diesem FI/RCD."));
    }
    subsection.append(subsectionHeading, circuits);
    card.append(heading, fields, checks, subsection);
    return card;
  }

  function createDistributionCard(distributionInput, index) {
    const distribution = {
      ...defaultDistribution(index + 1),
      ...distributionInput,
      clientId: distributionInput.clientId || createId(),
      rcds: distributionInput.rcds || [],
      directCircuits: distributionInput.directCircuits || []
    };
    const card = createElement("article", "distribution-card");
    card.dataset.distributionId = distribution.clientId;
    const heading = createElement("div", "card-heading");
    const titleGroup = createElement("div", "card-heading__title");
    const title = createElement(
      "strong",
      "distribution-card__title",
      distribution.name || `Verteilung ${index + 1}`
    );
    titleGroup.append(
      title,
      createElement("span", "", `Position ${index + 1} · Reihenfolge bleibt erhalten`)
    );
    const actions = createElement("div", "card-actions");
    actions.append(
      createActionButton("▾", "distribution-collapse", {
        title: "Verteilung ein- oder ausklappen"
      }),
      createActionButton("↑", "distribution-up", { title: "Verteilung nach oben" }),
      createActionButton("↓", "distribution-down", { title: "Verteilung nach unten" }),
      createActionButton("×", "distribution-delete", {
        className: "icon-button icon-button--danger",
        title: "Verteilung entfernen"
      })
    );
    heading.append(titleGroup, actions);

    const fields = createElement("div", "field-grid distribution-fields");
    fields.append(
      createField("Bezeichnung", "name", distribution.name, {
        maxLength: 120,
        placeholder: "z. B. UV EG"
      }),
      createField("Zuleitung kommt aus", "source", distribution.source, {
        maxLength: 120
      }),
      createField("Kabeltyp Zuleitung", "feedCableType", distribution.feedCableType, {
        maxLength: 100
      }),
      createField("Adernzahl Zuleitung", "feedCores", distribution.feedCores, {
        maxLength: 20,
        inputMode: "numeric"
      }),
      createField(
        "Querschnitt Zuleitung mm²",
        "feedCrossSection",
        distribution.feedCrossSection,
        { inputMode: "decimal" }
      ),
      createField(
        "Vorsicherung / Absicherung",
        "feedProtection",
        distribution.feedProtection,
        { maxLength: 120, placeholder: "z. B. NH 00 63 A" }
      ),
      createField("Ort", "location", distribution.location, { maxLength: 120 })
    );

    const rcdSection = createElement("section", "subsection");
    const rcdHeading = createElement("div", "subsection-heading");
    rcdHeading.append(
      createElement("strong", "", "FI/RCD-Gruppen"),
      createActionButton("+ FI/RCD", "distribution-add-rcd", {
        className: "button button--small"
      })
    );
    const rcdList = createElement("div", "rcd-list");
    rcdList.dataset.rcdList = "true";
    distribution.rcds.forEach((rcd) => rcdList.append(createRcdCard(rcd)));
    if (distribution.rcds.length === 0) {
      rcdList.append(createElement("div", "empty-card", "Keine FI/RCD-Gruppe erfasst."));
    }
    rcdSection.append(rcdHeading, rcdList);

    const directSection = createElement("section", "subsection");
    const directHeading = createElement("div", "subsection-heading");
    const directActions = document.createElement("div");
    directActions.append(
      createActionButton("+ Stromkreis", "distribution-add-direct", {
        className: "button button--small"
      }),
      createActionButton("+ FI/LS", "distribution-add-rcbo", {
        className: "button button--quiet button--small"
      })
    );
    directHeading.append(
      createElement("strong", "", "Direkte Stromkreise ohne vorgeschalteten FI"),
      directActions
    );
    const directCircuits = createElement("div", "circuit-list");
    directCircuits.dataset.circuitList = "direct";
    distribution.directCircuits.forEach((circuit) => {
      directCircuits.append(createCircuitCard(circuit, false));
    });
    if (distribution.directCircuits.length === 0) {
      directCircuits.append(createElement("div", "empty-card", "Keine direkten Stromkreise erfasst."));
    }
    directSection.append(directHeading, directCircuits);
    card.append(heading, fields, rcdSection, directSection);
    return card;
  }

  function renderDistributions(distributions) {
    elements.distributionList.replaceChildren();
    distributions.forEach((distribution, index) => {
      elements.distributionList.append(
        createDistributionCard(distribution, index)
      );
    });
    if (distributions.length === 0) {
      elements.distributionList.append(
        createElement(
          "div",
          "empty-card",
          "Noch keine Verteilung erfasst. Für den Abschluss wird mindestens eine benötigt."
        )
      );
    }
    updateAllCircuitVisibility();
  }

  function renderProtocol(protocolInput) {
    const protocol = normalizeProtocol(protocolInput);
    elements.networkType.value = protocol.networkType;
    elements.nominalVoltage.value = protocol.nominalVoltage || "230/400 V";
    elements.kindInitial.checked = Boolean(protocol.inspectionKinds.initial);
    elements.kindRecurring.checked = Boolean(protocol.inspectionKinds.recurring);
    elements.kindAlteration.checked = Boolean(protocol.inspectionKinds.alteration);
    renderVisualChecks(protocol);
    elements.incomingDesignation.value = protocol.incomingSupply.designation || "";
    elements.incomingLocation.value = protocol.incomingSupply.location || "";
    elements.incomingProtection.value =
      protocol.incomingSupply.upstreamProtection || "";
    elements.incomingSource.value = protocol.incomingSupply.source || "";
    elements.incomingCable.value = protocol.incomingSupply.cableType || "";
    elements.incomingCores.value = protocol.incomingSupply.cores || "";
    elements.incomingCrossSection.value =
      protocol.incomingSupply.crossSection || "";
    elements.circuitDirectoryIncluded.checked =
      Boolean(protocol.circuitDirectoryIncluded);
    elements.detailedInsulation.checked =
      Boolean(protocol.detailedInsulationMeasurement);
    renderDistributions(protocol.distributions);
    elements.equipmentManufacturer.value =
      protocol.testEquipment.manufacturer || "";
    elements.equipmentType.value = protocol.testEquipment.type || "";
    elements.equipmentSerial.value = protocol.testEquipment.serialNumber || "";
    elements.equipmentCalibration.value =
      protocol.testEquipment.calibrationValidUntil || "";
    elements.inspectionDefects.value = protocol.defects || "";
    elements.inspectionResult.value = protocol.result || "ok";
    elements.nextInspectionDate.value = protocol.nextInspectionDate || "";
    evaluateProtocol();
  }

  function fieldValue(root, fieldName) {
    return root.querySelector(`[data-field="${fieldName}"]`)?.value?.trim() || "";
  }

  function fieldChecked(root, fieldName) {
    return Boolean(
      root.querySelector(`[data-field="${fieldName}"]`)?.checked
    );
  }

  function readCircuit(card) {
    const type = fieldValue(card, "protectiveDevice.type") || "mcb";
    const breaker = ["mcb", "rcbo"].includes(type);
    const rcbo = type === "rcbo";
    const detailed = elements.detailedInsulation.checked;
    return {
      clientId: card.dataset.circuitId,
      name: fieldValue(card, "name"),
      cableType: fieldValue(card, "cableType"),
      cores: fieldValue(card, "cores"),
      crossSection: fieldValue(card, "crossSection"),
      protectiveDevice: {
        type,
        characteristic: breaker
          ? fieldValue(card, "protectiveDevice.characteristic")
          : null,
        ratedCurrent: fieldValue(card, "protectiveDevice.ratedCurrent"),
        designation: breaker
          ? null
          : fieldValue(card, "protectiveDevice.designation"),
        rcdType: rcbo ? fieldValue(card, "protectiveDevice.rcdType") : null,
        rcdCharacteristic: rcbo
          ? fieldValue(card, "protectiveDevice.rcdCharacteristic")
          : null,
        ratedResidualCurrent: rcbo
          ? fieldValue(card, "protectiveDevice.ratedResidualCurrent")
          : null,
        testButton: rcbo
          ? fieldChecked(card, "protectiveDevice.testButton")
          : false
      },
      measurements: {
        rpe: fieldValue(card, "measurements.rpe"),
        riso: fieldValue(card, "measurements.riso"),
        zi: fieldValue(card, "measurements.zi"),
        zs: fieldValue(card, "measurements.zs"),
        ik: fieldValue(card, "measurements.ik"),
        rcdTripTime: fieldValue(card, "measurements.rcdTripTime"),
        rcdTripCurrent: fieldValue(card, "measurements.rcdTripCurrent"),
        risoL1Pe: detailed
          ? fieldValue(card, "measurements.risoL1Pe")
          : null,
        risoL2Pe: detailed
          ? fieldValue(card, "measurements.risoL2Pe")
          : null,
        risoL3Pe: detailed
          ? fieldValue(card, "measurements.risoL3Pe")
          : null,
        risoNPe: detailed
          ? fieldValue(card, "measurements.risoNPe")
          : null
      },
      note: fieldValue(card, "note")
    };
  }

  function readRcd(card) {
    return {
      clientId: card.dataset.rcdId,
      name: fieldValue(card, "name"),
      type: fieldValue(card, "type"),
      characteristic: fieldValue(card, "characteristic"),
      ratedCurrent: fieldValue(card, "ratedCurrent"),
      ratedResidualCurrent: fieldValue(card, "ratedResidualCurrent"),
      testButton: fieldChecked(card, "testButton"),
      circuits: [...card.querySelectorAll(
        ":scope > .subsection > [data-circuit-list='rcd'] > .circuit-card"
      )].map(readCircuit)
    };
  }

  function readDistribution(card) {
    return {
      clientId: card.dataset.distributionId,
      name: fieldValue(card, "name"),
      source: fieldValue(card, "source"),
      feedCableType: fieldValue(card, "feedCableType"),
      feedCores: fieldValue(card, "feedCores"),
      feedCrossSection: fieldValue(card, "feedCrossSection"),
      feedProtection: fieldValue(card, "feedProtection"),
      location: fieldValue(card, "location"),
      rcds: [...card.querySelectorAll(
        ":scope > .subsection > [data-rcd-list] > .rcd-card"
      )].map(readRcd),
      directCircuits: [...card.querySelectorAll(
        ":scope > .subsection > [data-circuit-list='direct'] > .circuit-card"
      )].map(readCircuit)
    };
  }

  function collectProtocol() {
    return {
      schemaVersion: 1,
      networkType: elements.networkType.value,
      nominalVoltage: elements.nominalVoltage.value.trim(),
      inspectionKinds: {
        initial: elements.kindInitial.checked,
        recurring: elements.kindRecurring.checked,
        alteration: elements.kindAlteration.checked
      },
      visualChecks: Object.fromEntries(
        [...elements.visualChecks.querySelectorAll("[data-visual-check]")]
          .map((select) => [select.dataset.visualCheck, select.value])
      ),
      incomingSupply: {
        designation: elements.incomingDesignation.value.trim(),
        location: elements.incomingLocation.value.trim(),
        upstreamProtection: elements.incomingProtection.value.trim(),
        source: elements.incomingSource.value.trim(),
        cableType: elements.incomingCable.value.trim(),
        cores: elements.incomingCores.value.trim(),
        crossSection: elements.incomingCrossSection.value.trim()
      },
      circuitDirectoryIncluded: elements.circuitDirectoryIncluded.checked,
      detailedInsulationMeasurement: elements.detailedInsulation.checked,
      distributions: [...elements.distributionList.querySelectorAll(
        ":scope > .distribution-card"
      )].map(readDistribution),
      testEquipment: {
        manufacturer: elements.equipmentManufacturer.value.trim(),
        type: elements.equipmentType.value.trim(),
        serialNumber: elements.equipmentSerial.value.trim(),
        calibrationValidUntil: elements.equipmentCalibration.value || null
      },
      defects: elements.inspectionDefects.value.trim(),
      result: elements.inspectionResult.value,
      nextInspectionDate: elements.nextInspectionDate.value || null
    };
  }

  function updateCircuitVisibility(card) {
    const type = fieldValue(card, "protectiveDevice.type") || "mcb";
    const hasParentRcd = card.dataset.hasParentRcd === "true";
    const breaker = ["mcb", "rcbo"].includes(type);
    const rcbo = type === "rcbo";
    card.querySelectorAll("[data-visibility]").forEach((field) => {
      const visibility = field.dataset.visibility;
      field.hidden = (
        (visibility === "breaker" && !breaker)
        || (visibility === "rcbo" && !rcbo)
        || (
          visibility === "fuse-or-other"
          && breaker
        )
        || (
          visibility === "rcd-measurement"
          && !(hasParentRcd || rcbo)
        )
        || (
          visibility === "detailed-insulation"
          && !elements.detailedInsulation.checked
        )
      );
    });
  }

  function updateAllCircuitVisibility() {
    elements.distributionList.querySelectorAll(".circuit-card")
      .forEach(updateCircuitVisibility);
  }

  function decimal(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return Number.NaN;
    }
    const normalized = String(value).trim().replace(",", ".");
    return Number.parseFloat(normalized);
  }

  function evaluateCircuit(circuit, rcd = null) {
    const device = circuit.protectiveDevice;
    const measurements = circuit.measurements;
    const rcbo = device.type === "rcbo";
    const hasRcd = Boolean(rcd) || rcbo;
    const errors = [];
    const warnings = [];
    const riso = decimal(measurements.riso);
    const rpe = decimal(measurements.rpe);
    const zi = decimal(measurements.zi);
    const zs = decimal(measurements.zs);
    const ik = decimal(measurements.ik);

    if (Number.isNaN(riso)) {
      warnings.push("RISO fehlt");
    } else if (riso < 1) {
      errors.push("RISO liegt unter 1 MΩ");
    }
    if (!Number.isNaN(rpe) && rpe > 1) {
      warnings.push("RPE über 1 Ω plausibilisieren");
    }
    if (!Number.isNaN(zi) && zi > 50) {
      warnings.push("Zi ist ungewöhnlich hoch");
    }

    if (hasRcd) {
      const characteristic = rcbo
        ? device.rcdCharacteristic || ""
        : rcd.characteristic || "";
      const residualCurrent = decimal(
        rcbo ? device.ratedResidualCurrent : rcd.ratedResidualCurrent
      );
      const tripTime = decimal(measurements.rcdTripTime);
      const tripCurrent = decimal(measurements.rcdTripCurrent);
      const timeLimit = characteristic.includes("S /") ? 500 : 300;
      if (rcbo && !device.testButton) {
        warnings.push("FI/LS-Prüftaste nicht bestätigt");
      }
      if (Number.isNaN(tripTime)) {
        warnings.push("RCD-Auslösezeit fehlt");
      } else if (tripTime > timeLimit) {
        errors.push(`RCD-Auslösezeit über ${timeLimit} ms`);
      }
      if (Number.isNaN(tripCurrent)) {
        warnings.push("RCD-Auslösestrom fehlt");
      } else if (!Number.isNaN(residualCurrent)) {
        if (tripCurrent > residualCurrent) {
          errors.push("RCD-Auslösestrom liegt über IΔn");
        } else if (tripCurrent < residualCurrent * 0.5) {
          warnings.push("RCD-Auslösestrom unter 0,5 × IΔn prüfen");
        }
      }
    } else if (Number.isNaN(zs) && Number.isNaN(ik)) {
      warnings.push("Zs oder Ik fehlt");
    } else if (["mcb"].includes(device.type)) {
      const key = `${device.characteristic || ""}${device.ratedCurrent || ""}`;
      const tripCurrent = FUSE_TRIP_CURRENT[key];
      if (tripCurrent && !Number.isNaN(zs)) {
        const maximumZs = 230 / tripCurrent;
        if (zs > maximumZs) {
          errors.push(`Zs über ${maximumZs.toFixed(2)} Ω für ${key}`);
        }
      }
      if (tripCurrent && !Number.isNaN(ik) && ik < tripCurrent) {
        errors.push(`Ik unter ${tripCurrent} A für ${key}`);
      }
    }
    return { errors, warnings };
  }

  function evaluateProtocol() {
    const protocol = collectProtocol();
    const details = [];
    let errorCount = 0;
    let warningCount = 0;
    let circuitCount = 0;
    const circuitEvaluations = new Map(
      [...elements.distributionList.querySelectorAll(
        "[data-circuit-evaluation]"
      )].map((item) => [item.dataset.circuitEvaluation, item])
    );

    VISUAL_CHECKS.forEach(([key, label]) => {
      if (protocol.visualChecks[key] === "not_ok") {
        errorCount += 1;
        details.push(`${label}: n. i. O.`);
      }
    });

    protocol.distributions.forEach((distribution) => {
      distribution.rcds.forEach((rcd) => {
        if (!rcd.testButton) {
          warningCount += 1;
          details.push(`${distribution.name || "Verteilung"} / ${rcd.name || "FI/RCD"}: Prüftaste nicht bestätigt`);
        }
        rcd.circuits.forEach((circuit) => {
          circuitCount += 1;
          const result = evaluateCircuit(circuit, rcd);
          errorCount += result.errors.length;
          warningCount += result.warnings.length;
          const messages = [...result.errors, ...result.warnings];
          const evaluation = circuitEvaluations.get(circuit.clientId);
          if (evaluation) {
            evaluation.className = `circuit-evaluation ${
              result.errors.length > 0
                ? "circuit-evaluation--bad"
                : result.warnings.length > 0
                  ? "circuit-evaluation--warn"
                  : "circuit-evaluation--ok"
            }`;
            evaluation.textContent = messages.length > 0
              ? messages.join(" · ")
              : "Messwerte plausibel erfasst.";
          }
          messages.forEach((message) => {
            details.push(
              `${distribution.name || "Verteilung"} / ${circuit.name || "Stromkreis"}: ${message}`
            );
          });
        });
      });
      distribution.directCircuits.forEach((circuit) => {
        circuitCount += 1;
        const result = evaluateCircuit(circuit);
        errorCount += result.errors.length;
        warningCount += result.warnings.length;
        const messages = [...result.errors, ...result.warnings];
        const evaluation = circuitEvaluations.get(circuit.clientId);
        if (evaluation) {
          evaluation.className = `circuit-evaluation ${
            result.errors.length > 0
              ? "circuit-evaluation--bad"
              : result.warnings.length > 0
                ? "circuit-evaluation--warn"
                : "circuit-evaluation--ok"
          }`;
          evaluation.textContent = messages.length > 0
            ? messages.join(" · ")
            : "Messwerte plausibel erfasst.";
        }
        messages.forEach((message) => {
          details.push(
            `${distribution.name || "Verteilung"} / ${circuit.name || "Stromkreis"}: ${message}`
          );
        });
      });
    });

    elements.overallEvaluation.className = "evaluation";
    if (circuitCount === 0) {
      elements.overallEvaluation.classList.add("evaluation--neutral");
      elements.overallEvaluation.textContent = "Noch keine Stromkreise erfasst.";
    } else if (errorCount > 0) {
      elements.overallEvaluation.classList.add("evaluation--bad");
      elements.overallEvaluation.textContent =
        `${errorCount} Abweichung(en) und ${warningCount} Hinweis(e) in ${circuitCount} Stromkreis(en).`;
    } else if (warningCount > 0) {
      elements.overallEvaluation.classList.add("evaluation--warn");
      elements.overallEvaluation.textContent =
        `${warningCount} Hinweis(e) in ${circuitCount} Stromkreis(en) fachlich prüfen.`;
    } else {
      elements.overallEvaluation.classList.add("evaluation--ok");
      elements.overallEvaluation.textContent =
        `${circuitCount} Stromkreis(e) ohne erkannte Plausibilitätsabweichung.`;
    }
    elements.evaluationDetails.replaceChildren();
    details.slice(0, 30).forEach((message) => {
      elements.evaluationDetails.append(createElement("li", "", message));
    });
    if (details.length > 30) {
      elements.evaluationDetails.append(
        createElement("li", "", `${details.length - 30} weitere Hinweise`)
      );
    }
    return { errorCount, warningCount, circuitCount };
  }

  function currentDraftKey() {
    return currentInspection?.id
      ? `schaefchen-vde-draft:${currentInspection.id}`
      : `schaefchen-vde-draft:new:${constructionSiteId}`;
  }

  function persistLocalDraft() {
    if (!localDraftDirty || currentInspection?.status === "completed") return;
    try {
      window.localStorage.setItem(
        currentDraftKey(),
        JSON.stringify({
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          rowVersion: currentInspection?.rowVersion || null,
          clientInspectionId,
          inspectionName: elements.inspectionName.value,
          inspectionDate: elements.inspectionDate.value,
          inspectorUserId: elements.inspectionInspector.value,
          protocolData: collectProtocol()
        })
      );
      elements.localDraftState.textContent =
        "Fachdaten lokal zwischengespeichert · Unterschrift ausgenommen";
      localDraftDirty = false;
    } catch {
      elements.localDraftState.textContent = "Lokale Zwischenablage ist blockiert";
    }
  }

  function scheduleLocalDraft() {
    localDraftDirty = true;
    window.clearTimeout(localDraftTimer);
    localDraftTimer = window.setTimeout(persistLocalDraft, 350);
  }

  function restoreLocalDraft(serverInspection = null) {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(currentDraftKey()) || "null"
      );
      const matchesServer = !serverInspection
        || stored?.rowVersion === serverInspection.rowVersion;
      if (!stored || stored.schemaVersion !== 1 || !matchesServer) return false;
      clientInspectionId = stored.clientInspectionId || clientInspectionId;
      elements.inspectionName.value = stored.inspectionName || "";
      elements.editorTitle.textContent =
        stored.inspectionName || currentInspection?.name || "VDE-Prüfprotokoll";
      elements.inspectionDate.value = stored.inspectionDate || accessDate;
      populateInspectorSelect(
        elements.inspectionInspector,
        stored.inspectorUserId || serverInspection?.inspectorUserId
      );
      renderProtocol(stored.protocolData);
      const savedAt = new Date(stored.savedAt);
      elements.saveState.textContent = Number.isNaN(savedAt.valueOf())
        ? "Lokalen Zwischenstand wiederhergestellt"
        : `Lokalen Zwischenstand von ${new Intl.DateTimeFormat("de-DE", {
          dateStyle: "short",
          timeStyle: "short"
        }).format(savedAt)} wiederhergestellt`;
      localDraftDirty = false;
      return true;
    } catch {
      return false;
    }
  }

  function clearLocalDraft(key = currentDraftKey()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Der Serverstand bleibt maßgeblich, auch wenn lokaler Speicher blockiert ist.
    }
  }

  function clearSignature() {
    signatureContext.clearRect(
      0,
      0,
      elements.signaturePad.width,
      elements.signaturePad.height
    );
    signatureContext.lineWidth = 5;
    signatureContext.lineCap = "round";
    signatureContext.lineJoin = "round";
    signatureContext.strokeStyle = "#111111";
    signatureDrawn = false;
  }

  function signaturePosition(event) {
    const rectangle = elements.signaturePad.getBoundingClientRect();
    return {
      x: (event.clientX - rectangle.left)
        * elements.signaturePad.width / rectangle.width,
      y: (event.clientY - rectangle.top)
        * elements.signaturePad.height / rectangle.height
    };
  }

  function updateEditorState() {
    const completed = currentInspection?.status === "completed";
    const mayEdit = currentInspection
      ? vdeContext.permissions.edit
      : vdeContext.permissions.create;
    const selectedInspectorId = currentInspection?.inspectorUserId
      || elements.inspectionInspector.value;
    const mayComplete = vdeContext.permissions.complete
      && selectedInspectorId === vdeContext.viewer.id;
    elements.inspectionFields.disabled = Boolean(completed || !mayEdit);
    elements.inspectionInspector.disabled =
      Boolean(currentInspection?.id || completed || !mayEdit);
    elements.saveInspection.hidden = Boolean(completed || !mayEdit);
    elements.completeInspection.hidden = Boolean(
      completed || !mayComplete
    );
    elements.signatureSection.hidden = Boolean(
      completed || !mayComplete
    );
    elements.openPdf.hidden = !completed;
    elements.inspectionStatus.textContent = completed ? "Abgeschlossen" : "Entwurf";
    elements.inspectionStatus.className =
      `status-chip ${completed ? "status-chip--completed" : ""}`.trim();
    elements.inspectionNumber.textContent =
      currentInspection?.number || "Neuer Entwurf";
    elements.editorTitle.textContent =
      currentInspection?.name || "VDE-Prüfprotokoll";
    if (completed) {
      elements.openPdf.href = apiPath(
        `/inspections/${encodeURIComponent(currentInspection.id)}/pdf?date=${encodeURIComponent(accessDate)}`
      );
      elements.saveState.textContent = `Unveränderlich abgeschlossen am ${
        new Intl.DateTimeFormat("de-DE", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(new Date(currentInspection.completedAt))
      }`;
      elements.localDraftState.textContent = "Abschluss-PDF liegt in der Baustellenakte";
    } else {
      elements.saveState.textContent = currentInspection
        ? `Serverstand Version ${currentInspection.rowVersion}`
        : "Noch nicht auf dem Server gespeichert";
      elements.localDraftState.textContent =
        "Lokale Zwischenablage aktiv · Unterschrift ausgenommen";
    }
  }

  function setCurrentInspection(inspection) {
    localDraftDirty = false;
    currentInspection = inspection;
    selectedInspectionId = inspection?.id || null;
    clientInspectionId = inspection?.clientInspectionId || createId();
    elements.inspectionName.value = inspection?.name || "VDE-Prüfung";
    elements.inspectionDate.value = inspection?.inspectionDate || accessDate;
    populateInspectorSelect(
      elements.inspectionInspector,
      inspection?.inspectorUserId || vdeContext.viewer.id
    );
    renderProtocol(inspection?.protocolData || defaultProtocol());
    clearSignature();
    updateEditorState();
    renderInspectionList();
  }

  function updateCurrentUrl(inspectionId = null) {
    const url = new URL(window.location.href);
    url.searchParams.set("constructionSiteId", constructionSiteId);
    url.searchParams.set("date", accessDate);
    if (inspectionId) {
      url.searchParams.set("inspectionId", inspectionId);
    } else {
      url.searchParams.delete("inspectionId");
    }
    window.history.replaceState({}, "", url);
  }

  async function loadInspection(inspectionId) {
    elements.formMessage.textContent = "Prüfung wird geladen …";
    try {
      const body = await requestJson(
        apiPath(
          `/inspections/${encodeURIComponent(inspectionId)}?date=${encodeURIComponent(accessDate)}`
        )
      );
      setCurrentInspection(body.inspection);
      restoreLocalDraft(body.inspection);
      elements.formMessage.textContent = "";
    } catch (error) {
      showFatal(error.message);
    }
  }

  function upsertInspection(inspection) {
    const index = vdeContext.inspections.findIndex(
      (item) => item.id === inspection.id
    );
    if (index >= 0) {
      vdeContext.inspections[index] = inspection;
    } else {
      vdeContext.inspections.unshift(inspection);
    }
  }

  function inspectionPayload() {
    return {
      inspectionName: elements.inspectionName.value.trim(),
      inspectionDate: elements.inspectionDate.value,
      protocolData: collectProtocol()
    };
  }

  function setBusy(busy, message = "") {
    elements.saveInspection.disabled = busy;
    elements.completeInspection.disabled = busy;
    elements.legacyImportSubmit.disabled = busy;
    elements.legacyLocalImport.disabled = busy;
    if (message) elements.formMessage.textContent = message;
  }

  async function saveDraft(options = {}) {
    if (!elements.inspectionForm.reportValidity()) {
      throw new Error("Bitte die markierten Pflichtfelder ausfüllen.");
    }
    const previousDraftKey = currentDraftKey();
    const payload = inspectionPayload();
    let body;
    setBusy(true, "Entwurf wird gespeichert …");
    try {
      if (currentInspection?.id) {
        body = await requestJson(
          apiPath(
            `/inspections/${encodeURIComponent(currentInspection.id)}?date=${encodeURIComponent(accessDate)}`
          ),
          {
            method: "PATCH",
            body: JSON.stringify({
              ...payload,
              rowVersion: currentInspection.rowVersion
            })
          }
        );
      } else {
        body = await requestJson(
          apiPath(`/inspections?date=${encodeURIComponent(accessDate)}`),
          {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              constructionSiteId,
              clientInspectionId,
              inspectorUserId: elements.inspectionInspector.value
            })
          }
        );
      }
      clearLocalDraft(previousDraftKey);
      localDraftDirty = false;
      currentInspection = body.inspection;
      selectedInspectionId = currentInspection.id;
      clientInspectionId = currentInspection.clientInspectionId;
      clearLocalDraft(currentDraftKey());
      upsertInspection(currentInspection);
      updateCurrentUrl(currentInspection.id);
      updateEditorState();
      renderInspectionList();
      elements.formMessage.textContent = options.silent
        ? ""
        : `Entwurf ${currentInspection.number} wurde gespeichert.`;
      return currentInspection;
    } finally {
      setBusy(false);
    }
  }

  async function completeInspection() {
    if (!elements.inspectionForm.reportValidity()) {
      elements.formMessage.textContent =
        "Bitte die markierten Pflichtfelder ausfüllen.";
      return;
    }
    if (!signatureDrawn) {
      elements.formMessage.textContent =
        "Vor dem Abschluss fehlt die Prüferunterschrift.";
      elements.signaturePad.focus();
      return;
    }
    const evaluation = evaluateProtocol();
    if (
      (evaluation.errorCount > 0 || evaluation.warningCount > 0)
      && !window.confirm(
        `Die Plausibilitätsprüfung zeigt ${evaluation.errorCount} Abweichung(en) und ${evaluation.warningCount} Hinweis(e). Fachlich geprüft und trotzdem abschließen?`
      )
    ) {
      return;
    }
    setBusy(true, "Prüfung wird unveränderlich abgeschlossen und PDF erzeugt …");
    try {
      if (!currentInspection?.id) {
        await saveDraft({ silent: true });
        setBusy(true, "Prüfung wird unveränderlich abgeschlossen und PDF erzeugt …");
      }
      const payload = inspectionPayload();
      const body = await requestJson(
        apiPath(
          `/inspections/${encodeURIComponent(currentInspection.id)}/complete?date=${encodeURIComponent(accessDate)}`
        ),
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            rowVersion: currentInspection.rowVersion,
            inspectorSignatureData: elements.signaturePad.toDataURL("image/png")
          })
        }
      );
      clearLocalDraft();
      localDraftDirty = false;
      currentInspection = body.inspection;
      upsertInspection(currentInspection);
      updateEditorState();
      renderInspectionList();
      elements.formMessage.textContent =
        `${currentInspection.number} wurde abgeschlossen. Die PDF liegt in der zentralen Baustellenakte.`;
    } catch (error) {
      elements.formMessage.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  function findDistribution(protocol, card) {
    return protocol.distributions.find(
      (distribution) => distribution.clientId === card.dataset.distributionId
    );
  }

  function moveItem(items, index, direction) {
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
  }

  function circuitListForAction(protocol, button) {
    const distributionCard = button.closest(".distribution-card");
    const distribution = findDistribution(protocol, distributionCard);
    const rcdCard = button.closest(".rcd-card");
    if (rcdCard) {
      const rcd = distribution.rcds.find(
        (item) => item.clientId === rcdCard.dataset.rcdId
      );
      return rcd.circuits;
    }
    return distribution.directCircuits;
  }

  function rerenderStructure(protocol) {
    renderDistributions(protocol.distributions);
    evaluateProtocol();
    scheduleLocalDraft();
  }

  function handleStructureAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button || currentInspection?.status === "completed") return;
    const action = button.dataset.action;
    if (action === "distribution-collapse") {
      const card = button.closest(".distribution-card");
      card.classList.toggle("is-collapsed");
      button.textContent = card.classList.contains("is-collapsed") ? "▸" : "▾";
      return;
    }
    if (action === "rcd-collapse") {
      const card = button.closest(".rcd-card");
      card.classList.toggle("is-collapsed");
      button.textContent = card.classList.contains("is-collapsed") ? "▸" : "▾";
      return;
    }

    const protocol = collectProtocol();
    const distributionCard = button.closest(".distribution-card");
    const distribution = distributionCard
      ? findDistribution(protocol, distributionCard)
      : null;
    const distributionIndex = distribution
      ? protocol.distributions.indexOf(distribution)
      : -1;

    if (action === "distribution-up") {
      moveItem(protocol.distributions, distributionIndex, -1);
    } else if (action === "distribution-down") {
      moveItem(protocol.distributions, distributionIndex, 1);
    } else if (action === "distribution-delete") {
      if (!window.confirm(`Verteilung „${distribution.name || "ohne Namen"}“ aus diesem Entwurf entfernen?`)) {
        return;
      }
      protocol.distributions.splice(distributionIndex, 1);
    } else if (action === "distribution-add-rcd") {
      distribution.rcds.push(defaultRcd());
    } else if (action === "distribution-add-direct") {
      distribution.directCircuits.push(defaultCircuit());
    } else if (action === "distribution-add-rcbo") {
      const circuit = defaultCircuit("rcbo");
      circuit.name = "FI/LS Stromkreis";
      distribution.directCircuits.push(circuit);
    } else {
      const rcdCard = button.closest(".rcd-card");
      const rcd = rcdCard
        ? distribution.rcds.find(
          (item) => item.clientId === rcdCard.dataset.rcdId
        )
        : null;
      const rcdIndex = rcd ? distribution.rcds.indexOf(rcd) : -1;
      if (action === "rcd-up") {
        moveItem(distribution.rcds, rcdIndex, -1);
      } else if (action === "rcd-down") {
        moveItem(distribution.rcds, rcdIndex, 1);
      } else if (action === "rcd-delete") {
        if (!window.confirm(`FI/RCD „${rcd.name || "ohne Namen"}“ samt zugeordneten Stromkreisen entfernen?`)) {
          return;
        }
        distribution.rcds.splice(rcdIndex, 1);
      } else if (action === "rcd-add-circuit") {
        rcd.circuits.push(defaultCircuit());
      } else if (action.startsWith("circuit-")) {
        const circuits = circuitListForAction(protocol, button);
        const circuitCard = button.closest(".circuit-card");
        const circuitIndex = circuits.findIndex(
          (circuit) => circuit.clientId === circuitCard.dataset.circuitId
        );
        if (action === "circuit-up") {
          moveItem(circuits, circuitIndex, -1);
        } else if (action === "circuit-down") {
          moveItem(circuits, circuitIndex, 1);
        } else if (action === "circuit-delete") {
          const circuit = circuits[circuitIndex];
          if (!window.confirm(`Stromkreis „${circuit.name || "ohne Namen"}“ entfernen?`)) {
            return;
          }
          circuits.splice(circuitIndex, 1);
        }
      } else {
        return;
      }
    }
    rerenderStructure(protocol);
  }

  function updateDynamicHeadings(event) {
    const field = event.target;
    if (field === elements.inspectionName) {
      elements.editorTitle.textContent =
        field.value.trim() || "VDE-Prüfprotokoll";
      return;
    }
    if (field.dataset.field !== "name") return;
    const distributionCard = field.closest(".distribution-card");
    if (distributionCard && field.closest(".distribution-fields")) {
      distributionCard.querySelector(".distribution-card__title").textContent =
        field.value.trim() || "Unbenannte Verteilung";
    }
    const rcdCard = field.closest(".rcd-card");
    if (rcdCard && field.closest(".rcd-fields")) {
      rcdCard.querySelector(".rcd-card__title").textContent =
        field.value.trim() || "FI/RCD";
    }
    const circuitCard = field.closest(".circuit-card");
    if (circuitCard) {
      circuitCard.querySelector(".circuit-card__title").textContent =
        field.value.trim() || "Unbenannter Stromkreis";
    }
  }

  function legacyNumber(value) {
    const match = String(value ?? "")
      .replace(",", ".")
      .match(/-?\d+(?:\.\d+)?/);
    return match?.[0] || "";
  }

  function legacyCircuit(sourceInput = {}) {
    const source = sourceInput
      && typeof sourceInput === "object"
      && !Array.isArray(sourceInput)
      ? sourceInput
      : {};
    const type = source.device === "fils" ? "rcbo" : "mcb";
    return {
      clientId: createId(),
      name: String(source.name || "").slice(0, 200),
      cableType: String(source.cable || "").slice(0, 100),
      cores: String(source.cores || "").slice(0, 20),
      crossSection: legacyNumber(source.cross),
      protectiveDevice: {
        type,
        characteristic: String(source.char || "B").slice(0, 20),
        ratedCurrent: legacyNumber(source.a),
        designation: null,
        rcdType: type === "rcbo" ? String(source.rcdType || "A").slice(0, 20) : null,
        rcdCharacteristic: type === "rcbo"
          ? String(source.rcdChar || "unverzögert").slice(0, 50)
          : null,
        ratedResidualCurrent: type === "rcbo"
          ? legacyNumber(source.rcdIdn)
          : null,
        testButton: type === "rcbo" && Boolean(source.rcdTest)
      },
      measurements: {
        rpe: legacyNumber(source.rpe),
        riso: legacyNumber(source.riso),
        zi: legacyNumber(source.zi),
        zs: legacyNumber(source.zs),
        ik: legacyNumber(source.ik),
        rcdTripTime: legacyNumber(source.rcdms),
        rcdTripCurrent: legacyNumber(source.rcdma),
        risoL1Pe: null,
        risoL2Pe: null,
        risoL3Pe: null,
        risoNPe: null
      },
      note: String(source.note || "").slice(0, 500)
    };
  }

  function mapLegacyV15(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("Die V15-Datei enthält kein gültiges Datenobjekt.");
    }
    const fields = source.fields || {};
    const checks = source.checks || {};
    const resultText = String(fields.ergebnis || "").toLowerCase();
    const result = resultText.includes("nicht betriebsbereit")
      ? "not_operational"
      : resultText.includes("mit mängeln")
        ? "operational_with_defects"
        : "ok";
    const protocol = defaultProtocol();
    protocol.networkType = ["TN-S", "TN-C-S", "TN-C", "TT", "IT"].includes(
      fields.netzform
    ) ? fields.netzform : "TN-S";
    protocol.nominalVoltage = String(fields.spannung || "230/400 V").slice(0, 50);
    protocol.inspectionKinds = {
      initial: Boolean(fields.erst),
      recurring: Boolean(fields.wieder),
      alteration: Boolean(fields.aenderung)
    };
    protocol.visualChecks = Object.fromEntries(
      VISUAL_CHECKS.map(([key], index) => [
        key,
        checks[index] === "io"
          ? "ok"
          : checks[index] === "nio"
            ? "not_ok"
            : "not_checked"
      ])
    );
    protocol.incomingSupply = {
      designation: String(fields.hakName || "").slice(0, 120),
      location: String(fields.hakPlace || "").slice(0, 120),
      upstreamProtection: String(fields.hakFuse || "").slice(0, 120),
      source: String(fields.hakSource || "").slice(0, 120),
      cableType: String(
        fields.hakCable === "__custom"
          ? fields.hakCableCustom || ""
          : fields.hakCable || ""
      ).slice(0, 100),
      cores: String(fields.hakCores || "").slice(0, 20),
      crossSection: legacyNumber(fields.hakCross)
    };
    protocol.distributions = (Array.isArray(source.uvs) ? source.uvs : [])
      .slice(0, 50)
      .map((distributionInput) => {
        const distribution = distributionInput
          && typeof distributionInput === "object"
          && !Array.isArray(distributionInput)
          ? distributionInput
          : {};
        return {
          clientId: createId(),
          name: String(distribution.name || "").slice(0, 120),
          source: String(distribution.source || "").slice(0, 120),
          feedCableType: String(distribution.feedCable || "").slice(0, 100),
          feedCores: String(distribution.feedCores || "").slice(0, 20),
          feedCrossSection: legacyNumber(distribution.feedCross),
          feedProtection: String(
            distribution.feedFuse || distribution.feed || ""
          ).slice(0, 120),
          location: String(distribution.place || "").slice(0, 120),
          rcds: (Array.isArray(distribution.rcds) ? distribution.rcds : [])
            .slice(0, 50)
            .map((rcdInput) => {
              const rcd = rcdInput
                && typeof rcdInput === "object"
                && !Array.isArray(rcdInput)
                ? rcdInput
                : {};
              return {
                clientId: createId(),
                name: String(rcd.name || "").slice(0, 120),
                type: String(rcd.type || "A").slice(0, 20),
                characteristic: String(
                  rcd.char || "unverzögert"
                ).slice(0, 50),
                ratedCurrent: legacyNumber(rcd.inn),
                ratedResidualCurrent: legacyNumber(rcd.idn),
                testButton: Boolean(rcd.test),
                circuits: (Array.isArray(rcd.circuits) ? rcd.circuits : [])
                  .slice(0, 300)
                  .map((circuit) => {
                    const mapped = legacyCircuit(circuit);
                    mapped.protectiveDevice.type = "mcb";
                    mapped.protectiveDevice.rcdType = null;
                    mapped.protectiveDevice.rcdCharacteristic = null;
                    mapped.protectiveDevice.ratedResidualCurrent = null;
                    mapped.protectiveDevice.testButton = false;
                    return mapped;
                  })
              };
            }),
          directCircuits: (
            Array.isArray(distribution.direct) ? distribution.direct : []
          ).slice(0, 300).map(legacyCircuit)
        };
      });
    protocol.testEquipment = {
      manufacturer: String(fields.gHersteller || "").slice(0, 120),
      type: String(fields.gTyp || "").slice(0, 120),
      serialNumber: String(fields.gSerie || "").slice(0, 120),
      calibrationValidUntil: /^\d{4}-\d{2}-\d{2}$/.test(fields.gKal || "")
        ? fields.gKal
        : null
    };
    protocol.defects = String(fields.maengel || "").slice(0, 10_000);
    protocol.result = result;
    protocol.nextInspectionDate = /^\d{4}-\d{2}-\d{2}$/.test(fields.next || "")
      ? fields.next
      : null;
    return {
      inspectionName: `V15-Import · ${
        String(fields.objekt || fields.kunde || "VDE-Prüfung").slice(0, 175)
      }`,
      inspectionDate: /^\d{4}-\d{2}-\d{2}$/.test(fields.datum || "")
        ? fields.datum
        : accessDate,
      protocolData: protocol
    };
  }

  async function fileAsBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 32_768;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
  }

  async function importLegacy(event) {
    event.preventDefault();
    const jsonFile = elements.legacyJsonFile.files[0];
    const pdfFile = elements.legacyPdfFile.files[0];
    if (!jsonFile) {
      elements.legacyImportMessage.textContent = "Bitte eine V15-JSON-Datei auswählen.";
      return;
    }
    if (jsonFile.size > 1_000_000) {
      elements.legacyImportMessage.textContent = "Die V15-JSON ist größer als 1 MB.";
      return;
    }
    if (pdfFile && (pdfFile.size > 5_000_000 || !/\.pdf$/i.test(pdfFile.name))) {
      elements.legacyImportMessage.textContent =
        "Das Original muss eine PDF mit höchstens 5 MB sein.";
      return;
    }
    setBusy(true);
    elements.legacyImportMessage.textContent = "V15-Bestand wird geprüft und importiert …";
    try {
      const source = JSON.parse(await jsonFile.text());
      const body = await submitLegacyImport(source, jsonFile.name, pdfFile);
      upsertInspection(body.inspection);
      setCurrentInspection(body.inspection);
      updateCurrentUrl(body.inspection.id);
      elements.legacyImportForm.reset();
      populateInspectorSelect(elements.legacyInspector, vdeContext.viewer.id);
      elements.legacyImportMessage.textContent =
        `V15-Bestand als ${body.inspection.number} importiert. Eine alte Unterschrift wird nur über das Original-PDF bewahrt; der neue Abschluss wird erneut signiert.`;
      elements.legacyImportPanel.open = false;
    } catch (error) {
      elements.legacyImportMessage.textContent =
        error instanceof SyntaxError
          ? "Die ausgewählte Datei ist keine gültige JSON-Datei."
          : error.message;
    } finally {
      setBusy(false);
    }
  }

  async function submitLegacyImport(source, sourceName, pdfFile = null) {
    const mapped = mapLegacyV15(source);
    return requestJson(
      apiPath(`/imports?date=${encodeURIComponent(accessDate)}`),
      {
        method: "POST",
        body: JSON.stringify({
          ...mapped,
          constructionSiteId,
          clientInspectionId: createId(),
          inspectorUserId: elements.legacyInspector.value,
          sourceName: sourceName.slice(0, 255),
          originalPdf: pdfFile
            ? {
              fileName: pdfFile.name,
              contentBase64: await fileAsBase64(pdfFile)
            }
            : null
        })
      }
    );
  }

  async function importLegacyLocalDraft() {
    setBusy(true);
    elements.legacyImportMessage.textContent =
      "V15-Gerätespeicher wird geprüft und übernommen …";
    try {
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) {
        throw new Error("Auf diesem Gerät wurde kein V15-Zwischenstand gefunden.");
      }
      const body = await submitLegacyImport(
        JSON.parse(raw),
        "V15-Gerätespeicher.json"
      );
      upsertInspection(body.inspection);
      setCurrentInspection(body.inspection);
      updateCurrentUrl(body.inspection.id);
      elements.legacyImportMessage.textContent =
        `V15-Gerätespeicher als ${body.inspection.number} übernommen. Der alte lokale Stand bleibt zur Kontrolle erhalten.`;
      elements.legacyImportPanel.open = false;
    } catch (error) {
      elements.legacyImportMessage.textContent =
        error instanceof SyntaxError
          ? "Der gefundene V15-Gerätespeicher ist beschädigt."
          : error.message;
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    if (!constructionSiteId) {
      showFatal("In der Adresse fehlt die Baustellen-ID. Bitte das Modul aus einer Schäfchen-Baustelle starten.");
      return;
    }
    try {
      const body = await requestJson(
        apiPath(
          `/context?constructionSiteId=${encodeURIComponent(constructionSiteId)}&date=${encodeURIComponent(accessDate)}`
        )
      );
      vdeContext = body.context;
      renderContext();
      renderInspectionList();
      elements.loading.hidden = true;
      elements.app.hidden = false;
      if (selectedInspectionId) {
        await loadInspection(selectedInspectionId);
      } else {
        setCurrentInspection(null);
        restoreLocalDraft();
      }
    } catch (error) {
      const message = error.status === 401
        ? "Deine Sitzung ist abgelaufen. Bitte in Schäfchen erneut anmelden."
        : error.message;
      showFatal(message);
    }
  }

  elements.addDistribution.addEventListener("click", () => {
    const protocol = collectProtocol();
    protocol.distributions.push(
      defaultDistribution(protocol.distributions.length + 1)
    );
    rerenderStructure(protocol);
  });

  elements.backLink.addEventListener("click", (event) => {
    try {
      const referrer = new URL(document.referrer);
      if (
        referrer.origin === window.location.origin
        && !referrer.pathname.includes("/vde/")
      ) {
        event.preventDefault();
        window.history.back();
      }
    } catch {
      // Der normale Link bleibt der sichere Fallback für einen Direkteinstieg.
    }
  });
  elements.distributionList.addEventListener("click", handleStructureAction);
  elements.inspectionForm.addEventListener("input", (event) => {
    updateDynamicHeadings(event);
    if (event.target.dataset.field === "protectiveDevice.type") {
      updateCircuitVisibility(event.target.closest(".circuit-card"));
    }
    evaluateProtocol();
    scheduleLocalDraft();
  });
  elements.inspectionForm.addEventListener("change", (event) => {
    if (event.target === elements.inspectionInspector) {
      updateEditorState();
    }
    if (event.target === elements.detailedInsulation) {
      updateAllCircuitVisibility();
    }
    evaluateProtocol();
    scheduleLocalDraft();
  });
  elements.inspectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveDraft();
    } catch (error) {
      elements.formMessage.textContent = error.message;
    }
  });
  elements.completeInspection.addEventListener("click", completeInspection);
  elements.newInspection.addEventListener("click", () => {
    const hadServerInspection = Boolean(currentInspection);
    if (
      !hadServerInspection
      && !window.confirm(
        "Den aktuellen lokalen Entwurf verwerfen und eine neue leere VDE-Prüfung beginnen?"
      )
    ) {
      return;
    }
    if (hadServerInspection) persistLocalDraft();
    else clearLocalDraft();
    setCurrentInspection(null);
    updateCurrentUrl();
    if (hadServerInspection) restoreLocalDraft();
    elements.formMessage.textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  elements.legacyImportForm.addEventListener("submit", importLegacy);
  elements.legacyLocalImport.addEventListener("click", importLegacyLocalDraft);
  elements.clearSignature.addEventListener("click", clearSignature);

  elements.signaturePad.addEventListener("pointerdown", (event) => {
    if (currentInspection?.status === "completed") return;
    drawingSignature = true;
    signatureDrawn = true;
    elements.signaturePad.setPointerCapture(event.pointerId);
    const position = signaturePosition(event);
    signatureContext.beginPath();
    signatureContext.moveTo(position.x, position.y);
    event.preventDefault();
  });
  elements.signaturePad.addEventListener("pointermove", (event) => {
    if (!drawingSignature) return;
    const position = signaturePosition(event);
    signatureContext.lineTo(position.x, position.y);
    signatureContext.stroke();
    event.preventDefault();
  });
  const finishSignature = (event) => {
    if (!drawingSignature) return;
    drawingSignature = false;
    if (elements.signaturePad.hasPointerCapture(event.pointerId)) {
      elements.signaturePad.releasePointerCapture(event.pointerId);
    }
  };
  elements.signaturePad.addEventListener("pointerup", finishSignature);
  elements.signaturePad.addEventListener("pointercancel", finishSignature);
  window.addEventListener("pagehide", persistLocalDraft);

  clearSignature();
  initialize();
})();
