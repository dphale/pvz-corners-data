(() => {
  const params = new URLSearchParams(window.location.search);
  const dataRoot = params.get("source") === "published" ? "./published" : "./data";
  const documentUrl = new URL(`${dataRoot}/map-document.json`, window.location.href);
  const cornerPointsUrl = new URL(`${dataRoot}/corner-points.json`, window.location.href);
  const bicyclistCornerPointsUrl = new URL(
    `${dataRoot}/bicyclist-corner-points.json`,
    window.location.href,
  );
  const bicyclistDocumentUrl = new URL(
    `${dataRoot}/bicyclist-map-document.json`,
    window.location.href,
  );
  const streetDocumentUrl = new URL(
    `${dataRoot}/street-map-document.json`,
    window.location.href,
  );
  const streetIndexUrl = new URL(`${dataRoot}/streets.json`, window.location.href);
  const paintedCrosswalksUrl = new URL(
    `${dataRoot}/painted-crosswalks.json`,
    window.location.href,
  );
  const hinDocumentUrl = new URL(`${dataRoot}/hin-2024.json`, window.location.href);
  const safetyCorridorsDocumentUrl = new URL(
    `${dataRoot}/safety-corridors-2024.json`,
    window.location.href,
  );
  const mobilityPlanDocumentUrl = new URL(
    `${dataRoot}/mobility-plan-2035.json`,
    window.location.href,
  );
  const schoolRadiusDocumentUrl = new URL(
    `${dataRoot}/school-radius.json`,
    window.location.href,
  );
  const parkRadiusDocumentUrl = new URL(
    `${dataRoot}/park-radius.json`,
    window.location.href,
  );
  const schoolsDocumentUrl = new URL(`${dataRoot}/la-city-schools.json`, window.location.href);
  const parksDocumentUrl = new URL(`${dataRoot}/la-city-parks.json`, window.location.href);
  // Bust Chrome's HTTP cache for published JSON after a local republish.
  if (dataRoot === "./published") {
    const bust = String(Date.now());
    for (const url of [
      documentUrl,
      cornerPointsUrl,
      bicyclistCornerPointsUrl,
      bicyclistDocumentUrl,
      streetDocumentUrl,
      streetIndexUrl,
      paintedCrosswalksUrl,
      hinDocumentUrl,
      safetyCorridorsDocumentUrl,
      mobilityPlanDocumentUrl,
      schoolRadiusDocumentUrl,
      parkRadiusDocumentUrl,
      schoolsDocumentUrl,
      parksDocumentUrl,
    ]) {
      url.searchParams.set("_", bust);
    }
  }
  // Avoid stale published JSON after a local republish (Chrome caches aggressively).
  function fetchJson(url, { optional = false } = {}) {
    return fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        if (optional) {
          return null;
        }
        throw new Error(`${url.pathname || url} HTTP ${response.status}`);
      }
      return response.json();
    });
  }
  const boundariesUrl = new URL(
    "../../boundaries/la-council-districts-2021.geojson",
    window.location.href,
  );
  const cityBoundariesUrl = new URL(
    "../../boundaries/la-county-cities.geojson",
    window.location.href,
  );
  const schoolBoundariesUrl = new URL(
    "../../boundaries/la-county-school-districts.geojson",
    window.location.href,
  );
  // Bust caches when comparison cities are added to the boundary file.
  cityBoundariesUrl.searchParams.set("v", "comparison-cities-county");

  const FIT_PADDING = [16, 16];

  const state = {
    document: null,
    bicyclistDocument: null,
    places: [],
    years: [],
    ageGroups: [],
    mode: "all",
    geography: "district",
    severity: "",
    map: null,
    allDistrictsLayer: null,
    layersByDistrict: new Map(),
    cornerLayer: null,
    cornerMarkers: new Map(),
    cornerPointsByName: new Map(),
    cornerDistrictByName: new Map(),
    cornerModeByName: new Map(),
    paintedLayer: null,
    paintedMarkers: new Map(),
    paintedDistricts: new Map(),
    paintedShapes: new Map(),
    paintedCrosswalks: false,
    pvzEnabled: false,
    hin2024: false,
    safetyCorridors2024: false,
    schools: false,
    parks: false,
    parksEnabled: false,
    parkRadiusDocument: null,
    parksDocument: null,
    parkRadiusLayer: null,
    listedParkRadiusLayer: null,
    selectedParkName: null,
    selectedParkCount: null,
    selectedParkRadiusLayer: null,
    selectedParkMarker: null,
    schoolRadiusDocument: null,
    schoolsDocument: null,
    schoolRadiusLayer: null,
    listedSchoolRadiusLayer: null,
    selectedSchoolName: null,
    selectedSchoolCount: null,
    selectedSchoolRadiusLayer: null,
    selectedSchoolMarker: null,
    hinReady: false,
    hinDocument: null,
    hinLayer: null,
    hinDrawn: new Map(),
    mobilityPlanEnabled: false,
    mobilityPlanOn: false,
    mobilityPlanReady: false,
    mobilityPlanDocument: null,
    mobilityPlanLayer: null,
    mobilityPlanDrawn: new Map(),
    mobilityPlanLegend: null,
    corridorsReady: false,
    safetyCorridorsDocument: null,
    corridorsLayer: null,
    corridorsDrawn: new Map(),
    view: "pedestrian",
    cityLayer: null,
    cornerYears: "",
    streetDocument: null,
    streetIndex: null,
    rateMode: false,
    tableMeasure: "totals",
    shownCities: [],
    cityPlaces: new Set(),
  };

  function placeList(document) {
    if (Object.hasOwn(document.district_totals || {}, "Unassigned")) {
      return [...document.districts, "Unassigned"];
    }
    return [...document.districts];
  }

  function fitAllDistricts() {
    if (!state.map || !state.allDistrictsLayer) {
      return;
    }
    state.map.fitBounds(state.allDistrictsLayer.getBounds(), {
      padding: FIT_PADDING,
      animate: false,
    });
  }

  function fitDistrict(place) {
    if (!state.map) {
      return;
    }
    const layer = state.layersByDistrict.get(place);
    if (!layer) {
      return;
    }
    state.map.fitBounds(layer.getBounds(), {
      padding: FIT_PADDING,
      animate: false,
    });
  }

  function districtLabel(number) {
    return `Council District ${number}`;
  }

  const choropleth = window.CornersChoropleth;
  const placeSelection = window.CornersPlaceSelection;
  const cornerCount = window.CornerCount;

  function maxRate(document) {
    if (!document.district_rates) {
      return 0;
    }
    const rates = {};
    for (const [place, row] of Object.entries(document.district_rates)) {
      rates[place] = Number(row.rate) || 0;
    }
    return choropleth.peakFromTotals(rates);
  }

  function maxAgeTotal(document, ageGroup) {
    const totals = {};
    for (const [place, row] of Object.entries(document.district_age_totals || {})) {
      if (place === choropleth.UNASSIGNED) {
        continue;
      }
      totals[place] = row[ageGroup] || 0;
    }
    return choropleth.peakFromTotals(totals);
  }

  function activeDocument() {
    if (state.mode === "bicyclist" && state.bicyclistDocument) {
      return state.bicyclistDocument;
    }
    return state.document;
  }

  function headingsToShow(document) {
    if (!state.years.length) {
      return document.year_headings;
    }
    return document.year_headings.filter((heading) => state.years.includes(heading));
  }

  function ageFilterActive() {
    return state.ageGroups.length > 0;
  }

  function sumAgeHeading(ages, heading) {
    if (!ages || !ageFilterActive()) {
      return 0;
    }
    let total = 0;
    for (const label of state.ageGroups) {
      total += Number(ages[label]?.[heading]) || 0;
    }
    return total;
  }

  function sumAgeYearMaps(ageYears) {
    if (!ageYears || !ageFilterActive()) {
      return {};
    }
    const combined = {};
    for (const label of state.ageGroups) {
      for (const [heading, amount] of Object.entries(ageYears[label] || {})) {
        combined[heading] = (combined[heading] || 0) + (Number(amount) || 0);
      }
    }
    return combined;
  }

  function narrowedMap() {
    return Boolean(
      ageFilterActive() ||
        state.severity ||
        state.years.length ||
        state.mode === "bicyclist" ||
        state.mode === "all",
    );
  }

  function severityBuckets(container) {
    if (state.severity === "killed") {
      return { years: container.killed_years, ages: container.killed_age_years };
    }
    if (state.severity === "serious") {
      return { years: container.serious_years, ages: container.serious_age_years };
    }
    return null;
  }

  function countFromBuckets(years, ages, heading) {
    if (ageFilterActive() && ages) {
      return sumAgeHeading(ages, heading);
    }
    if (years) {
      return years[heading] || 0;
    }
    return 0;
  }

  function cityPlace(document, place) {
    if (document?.city_years?.[place]) {
      return document.city_years[place];
    }
    if (document === state.document) {
      return state.document?.rate_comparison?.[place] || null;
    }
    return null;
  }

  function countInDocument(document, place, heading) {
    if (!document) {
      return 0;
    }
    if (document.district_years?.[place]) {
      const severity = severityBuckets(document);
      if (severity) {
        return countFromBuckets(severity.years?.[place], severity.ages?.[place], heading);
      }
      if (ageFilterActive() && document.district_age_years?.[place]) {
        return sumAgeHeading(document.district_age_years[place], heading);
      }
      return document.district_years[place][heading] || 0;
    }
    const city = cityPlace(document, place);
    if (!city) {
      return 0;
    }
    const severity = severityBuckets(city);
    if (severity) {
      return countFromBuckets(severity.years, severity.ages, heading);
    }
    if (ageFilterActive() && city.age_years) {
      return sumAgeHeading(city.age_years, heading);
    }
    return city.years?.[heading] || 0;
  }

  function schoolZonePlaceYearCount(place, heading) {
    const year = String(heading).replace(/P$/, "");
    const severityKey = state.severity || "";
    const zoneFor = (populationKey) => {
      const population = state.schoolRadiusDocument?.[populationKey];
      if (!population) {
        return 0;
      }
      if (ageFilterActive() && population.by_district_year_age?.[place]?.[year]) {
        return state.ageGroups.reduce((sum, age) => {
          const slice = population.by_district_year_age[place][year]?.[age]?.[severityKey];
          return sum + (Number(slice?.zone) || 0);
        }, 0);
      }
      if (ageFilterActive() && population.by_district_age?.[place]) {
        return state.ageGroups.reduce((sum, age) => {
          const slice = population.by_district_age[place]?.[age]?.[severityKey];
          return sum + (Number(slice?.zone) || 0);
        }, 0);
      }
      const slice = population.by_district_year?.[place]?.[year]?.[severityKey];
      return Number(slice?.zone) || 0;
    };
    if (state.mode === "all") {
      return zoneFor("pedestrian") + zoneFor("bicyclist");
    }
    return zoneFor(schoolRadiusModeKey());
  }

  function placeYearCount(document, place, heading) {
    if (
      state.schools &&
      state.schoolRadiusDocument &&
      String(place).startsWith("Council District")
    ) {
      return schoolZonePlaceYearCount(place, heading);
    }
    const count = countInDocument(document, place, heading);
    if (state.mode === "all" && document === state.document && state.bicyclistDocument) {
      return count + countInDocument(state.bicyclistDocument, place, heading);
    }
    return count;
  }

  function totalYearCount(document, heading) {
    if (state.places.length) {
      let selected = 0;
      for (const place of state.places) {
        selected += placeYearCount(document, place, heading);
      }
      return selected;
    }
    let sum = 0;
    for (const place of placeList(document)) {
      sum += placeYearCount(document, place, heading);
    }
    return sum;
  }

  function measureForDistrict(place) {
    const document = activeDocument();
    if (!document) {
      return 0;
    }
    if (!narrowedMap() && state.rateMode && state.document.district_rates?.[place]) {
      return Number(state.document.district_rates[place].rate) || 0;
    }
    let total = 0;
    for (const heading of headingsToShow(document)) {
      total += placeYearCount(document, place, heading);
    }
    return total;
  }

  function peakMeasure() {
    const document = activeDocument();
    if (!document) {
      return 0;
    }
    if (!narrowedMap() && state.rateMode) {
      return maxRate(state.document);
    }
    let peak = 0;
    for (const place of document.districts || []) {
      peak = Math.max(peak, measureForDistrict(place));
    }
    return peak;
  }

  function fillBandForDistrict(place) {
    return choropleth.fillBand(measureForDistrict(place), peakMeasure());
  }

  const FALLBACK_COMPARISON_CITIES = [
    "BEVERLY HILLS",
    "BURBANK",
    "CULVER CITY",
    "GLENDALE",
    "LONG BEACH",
    "SANTA MONICA",
    "WEST HOLLYWOOD",
  ];

  function syncRateOptionVisibility() {
    documentElement("rate-mode-label").hidden = true;
  }

  function comparisonCitiesAvailable() {
    const bike = state.bicyclistDocument?.city_years;
    if (bike && Object.keys(bike).length) {
      return Object.keys(bike).sort();
    }
    const rates = state.document?.rate_comparison;
    if (rates) {
      return Object.keys(rates)
        .filter((place) => !place.startsWith("Council District"))
        .sort();
    }
    return [...FALLBACK_COMPARISON_CITIES];
  }

  function shownCityRows() {
    return [...state.shownCities].sort();
  }

  function syncCitySuggestions() {
    const list = documentElement("city-suggestions");
    if (!list) {
      return;
    }
    list.replaceChildren(
      ...comparisonCitiesAvailable().map((place) => {
        const option = window.document.createElement("option");
        option.value = place;
        return option;
      }),
    );
  }

  function setShownCities(places) {
    const available = new Set(comparisonCitiesAvailable());
    state.shownCities = [...new Set(places)].filter((place) => available.has(place)).sort();
    const shown = new Set(state.shownCities);
    const kept = state.places.filter(
      (place) => !available.has(place) || shown.has(place),
    );
    const next = [...kept];
    const have = new Set(next);
    for (const place of state.shownCities) {
      if (!have.has(place)) {
        next.push(place);
        have.add(place);
      }
    }
    syncCitySuggestions();
    applyPlaces(next);
  }

  function toggleShownCity(place) {
    const available = comparisonCitiesAvailable();
    if (!available.includes(place)) {
      return;
    }
    if (state.shownCities.includes(place)) {
      setShownCities(state.shownCities);
      return;
    }
    setShownCities([...state.shownCities, place]);
  }

  function allPlaces(document) {
    const places = placeList(document);
    for (const place of shownCityRows()) {
      if (!places.includes(place)) {
        places.push(place);
      }
    }
    return places;
  }

  const DISTRICT_FILL = "#8ec8ff";
  const CITY_FILL = "#ffe56a";
  const PLACE_FILL_OPACITY = 0.4;

  function placeFillColor(place) {
    return state.cityPlaces.has(place) ? CITY_FILL : DISTRICT_FILL;
  }

  function districtPathStyle(place) {
    const selected = state.places.includes(place);
    const colored = state.places.length === 0 || selected;
    return {
      fillColor: placeFillColor(place),
      weight: selected ? 3 : 1,
      color: selected ? "#111" : "#666",
      fillOpacity: colored ? PLACE_FILL_OPACITY : 0,
    };
  }

  function refreshChoropleth() {
    for (const [place, layer] of state.layersByDistrict) {
      layer.setStyle(districtPathStyle(place));
    }
  }

  function cell(tag, text) {
    const el = window.document.createElement(tag);
    el.textContent = text;
    return el;
  }

  function documentElement(id) {
    const el = window.document.getElementById(id);
    if (!el) {
      throw new Error(`missing #${id}`);
    }
    return el;
  }

  function renderYearTotals() {
    renderPlaceYearMatrix(activeDocument());
  }

  function axisButton(label, kind, value) {
    const button = window.document.createElement("button");
    button.type = "button";
    button.className = "axis-select";
    button.textContent = label;
    const pressed = kind === "place" ? state.places.includes(value) : state.years.includes(value);
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    if (kind === "place") {
      button.dataset.place = value;
      button.addEventListener("click", () => togglePlace(value));
    } else {
      button.dataset.year = value;
      button.addEventListener("click", () => toggleYear(value));
    }
    return button;
  }

  function placeShowAllButton() {
    const clearButton = documentElement("show-all-districts");
    const selectButton = documentElement("select-all-districts");
    const unselectButton = documentElement("unselect-all-districts");
    const cityGroup = documentElement("city-of-la-group");
    const cityLabel = documentElement("city-of-la-label");
    const districts = activeDocument().districts;
    cityGroup.hidden = false;
    cityLabel.hidden = false;
    selectButton.hidden = false;
    unselectButton.hidden = false;
    selectButton.disabled = placeSelection.selectAllDisabled(state.places, districts);
    unselectButton.disabled = placeSelection.unselectAllDisabled(state.places);
    clearButton.disabled = state.shownCities.length === 0;
  }

  function updateSelectedTotal(document) {
    const selectedTotal = documentElement("selected-total");
    const selectedRow = documentElement("selected-places-row");
    if (!state.places.length) {
      selectedRow.hidden = true;
      selectedTotal.removeAttribute("data-total");
      selectedTotal.removeAttribute("data-testid");
      selectedTotal.textContent = "";
      placeShowAllButton();
      return;
    }
    const headings = state.years.length ? headingsToShow(document) : document.year_headings;
    const total = headings.reduce((sum, heading) => sum + totalYearCount(document, heading), 0);
    selectedRow.hidden = true;
    selectedTotal.textContent = "";
    selectedTotal.setAttribute("data-testid", "selected-total");
    selectedTotal.dataset.total = String(total);
    placeShowAllButton();
  }

  function populationFor(place) {
    const district = state.document?.district_rates?.[place];
    if (Number.isInteger(district?.population)) {
      return district.population;
    }
    const city = state.document?.rate_comparison?.[place];
    if (Number.isInteger(city?.population)) {
      return city.population;
    }
    return 0;
  }

  function shownRate(count, population) {
    if (!population) {
      return "NA";
    }
    const numerator = count * 100000;
    const quotient = Math.floor(numerator / population);
    const remainder = numerator % population;
    if (remainder * 2 >= population) {
      return String(quotient + 1);
    }
    return String(quotient);
  }

  function hideRateYearTable() {
    const section = documentElement("rate-year-section");
    section.hidden = true;
    documentElement("rate-year-table").replaceChildren();
  }

  function placeGapRow(columnCount) {
    const row = window.document.createElement("tr");
    row.className = "place-gap";
    row.setAttribute("aria-hidden", "true");
    const td = window.document.createElement("td");
    td.colSpan = columnCount;
    row.appendChild(td);
    return row;
  }

  function appendPlaceRateRow(body, document, place, headings) {
    const row = window.document.createElement("tr");
    const placeCell = cell("td", "");
    placeCell.appendChild(axisButton(place, "place", place));
    row.appendChild(placeCell);
    if (state.places.includes(place)) {
      row.classList.add("is-selected");
    }
    const population = populationFor(place);
    for (const heading of headings) {
      const count = placeYearCount(document, place, heading);
      const value = cell("td", shownRate(count, population));
      value.dataset.place = place;
      value.dataset.year = heading;
      value.dataset.field = "rate";
      if (state.years.includes(heading)) {
        value.classList.add("is-selected");
      }
      row.appendChild(value);
    }
    body.appendChild(row);
  }

  function appendPlaceTotalRow(body, document, place, headings, columnTotals) {
    const row = window.document.createElement("tr");
    const placeCell = cell("td", "");
    placeCell.appendChild(axisButton(place, "place", place));
    row.appendChild(placeCell);
    if (state.places.includes(place)) {
      row.classList.add("is-selected");
    }
    let rowTotal = 0;
    headings.forEach((heading, index) => {
      const count = placeYearCount(document, place, heading);
      rowTotal += count;
      if (columnTotals) {
        columnTotals[index] += count;
      }
      const value = cell("td", String(count));
      value.dataset.place = place;
      value.dataset.year = heading;
      if (state.years.includes(heading)) {
        value.classList.add("is-selected");
      }
      row.appendChild(value);
    });
    const rowTotalCell = cell("td", String(rowTotal));
    rowTotalCell.dataset.place = place;
    rowTotalCell.dataset.total = "row";
    rowTotalCell.className = "row-total";
    row.appendChild(rowTotalCell);
    body.appendChild(row);
    return rowTotal;
  }

  function renderRateYearTable(document) {
    const section = documentElement("rate-year-section");
    section.hidden = false;
    const headings = document.year_headings;
    const root = documentElement("rate-year-table");
    const table = window.document.createElement("table");
    table.className = "data-table";
    const head = window.document.createElement("thead");
    const headRow = window.document.createElement("tr");
    headRow.appendChild(cell("th", "Place"));
    for (const heading of headings) {
      const th = cell("th", "");
      th.appendChild(axisButton(heading, "year", heading));
      if (state.years.includes(heading)) {
        th.classList.add("is-selected");
      }
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    table.appendChild(head);
    const body = window.document.createElement("tbody");
    for (const place of placeList(document)) {
      appendPlaceRateRow(body, document, place, headings);
    }
    body.appendChild(placeGapRow(1 + headings.length));
    for (const place of shownCityRows()) {
      appendPlaceRateRow(body, document, place, headings);
    }
    table.appendChild(body);
    root.replaceChildren(table);
  }

  function setTableMeasure(value) {
    state.tableMeasure = value === "rates" ? "rates" : "totals";
    syncSegment("table-measure", state.tableMeasure);
    renderSidebar();
  }

  function renderPlaceYearMatrix(document) {
    const showRates = state.tableMeasure === "rates";
    documentElement("table-measure-field").hidden = false;
    syncSegment("table-measure", showRates ? "rates" : "totals");
    const heading = documentElement("sidebar-table-heading");
    heading.textContent = "Place and year table";
    heading.classList.add("visually-hidden");
    updateSelectedTotal(document);
    if (showRates) {
      documentElement("sidebar-table").replaceChildren();
      renderRateYearTable(document);
      return;
    }
    hideRateYearTable();

    const laPlaces = placeList(document);
    const headings = document.year_headings;
    const root = documentElement("sidebar-table");
    const table = window.document.createElement("table");
    table.className = "data-table";
    table.setAttribute("data-testid", "year-table");

    const head = window.document.createElement("thead");
    const headRow = window.document.createElement("tr");
    headRow.appendChild(cell("th", "Place"));
    for (const heading of headings) {
      const th = cell("th", "");
      th.appendChild(axisButton(heading, "year", heading));
      if (state.years.includes(heading)) {
        th.classList.add("is-selected");
      }
      headRow.appendChild(th);
    }
    const totalHeader = cell("th", "Total");
    totalHeader.className = "row-total";
    headRow.appendChild(totalHeader);
    head.appendChild(headRow);
    table.appendChild(head);

    const body = window.document.createElement("tbody");
    const columnTotals = headings.map(() => 0);
    let grand = 0;
    for (const place of laPlaces) {
      grand += appendPlaceTotalRow(body, document, place, headings, columnTotals);
    }

    const totalsRow = window.document.createElement("tr");
    totalsRow.className = "totals";
    totalsRow.appendChild(cell("td", "Total"));
    headings.forEach((heading, index) => {
      const value = cell("td", String(columnTotals[index]));
      value.dataset.year = heading;
      value.dataset.total = "column";
      if (state.years.includes(heading)) {
        value.classList.add("is-selected");
      }
      totalsRow.appendChild(value);
    });
    const grandCell = cell("td", String(grand));
    grandCell.dataset.total = "all";
    grandCell.className = "row-total";
    totalsRow.appendChild(grandCell);
    body.appendChild(totalsRow);
    body.appendChild(placeGapRow(2 + headings.length));
    for (const place of shownCityRows()) {
      appendPlaceTotalRow(body, document, place, headings, null);
    }

    table.appendChild(body);
    root.replaceChildren(table);
  }

  function renderStreetAgeTable(streetDocument) {
    hideRateYearTable();
    documentElement("table-measure-field").hidden = true;
    const heading = documentElement("sidebar-table-heading");
    heading.textContent = `${streetDocument.street} (${streetDocument.city}) by age group`;
    heading.classList.remove("visually-hidden");
    documentElement("city-of-la-group").hidden = true;
    documentElement("city-of-la-label").hidden = true;
    documentElement("select-all-districts").hidden = true;
    documentElement("unselect-all-districts").hidden = true;
    documentElement("selected-places-row").hidden = true;
    const selectedTotal = documentElement("selected-total");
    selectedTotal.textContent = "";
    selectedTotal.removeAttribute("data-total");
    selectedTotal.removeAttribute("data-testid");

    const root = documentElement("sidebar-table");
    const table = window.document.createElement("table");
    table.className = "data-table";
    table.setAttribute("data-testid", "age-group-table");

    const head = window.document.createElement("thead");
    const headRow = window.document.createElement("tr");
    headRow.appendChild(cell("th", "Age group"));
    for (const heading of streetDocument.year_headings) {
      const th = cell("th", "");
      th.appendChild(axisButton(heading, "year", heading));
      if (state.years.includes(heading)) {
        th.classList.add("is-selected");
      }
      headRow.appendChild(th);
    }
    const totalHeader = cell("th", "Total");
    totalHeader.className = "row-total";
    headRow.appendChild(totalHeader);
    head.appendChild(headRow);
    table.appendChild(head);

    const body = window.document.createElement("tbody");
    const counts = streetAgeYears(streetDocument);
    const headings = streetDocument.year_headings;
    const columnTotals = headings.map(() => 0);
    let grand = 0;
    const labels = ageFilterActive()
      ? Object.keys(streetDocument.age_years).filter((label) =>
          state.ageGroups.includes(label),
        )
      : Object.keys(streetDocument.age_years);
    for (const label of labels) {
      const row = window.document.createElement("tr");
      row.appendChild(cell("td", label));
      let rowTotal = 0;
      headings.forEach((heading, index) => {
        const count = counts?.[label]?.[heading] ?? 0;
        rowTotal += count;
        columnTotals[index] += count;
        const td = cell("td", String(count));
        td.dataset.age = label;
        td.dataset.year = heading;
        row.appendChild(td);
      });
      const rowTotalCell = cell("td", String(rowTotal));
      rowTotalCell.dataset.age = label;
      rowTotalCell.dataset.total = "row";
      rowTotalCell.className = "row-total";
      row.appendChild(rowTotalCell);
      grand += rowTotal;
      body.appendChild(row);
    }
    const totalsRow = window.document.createElement("tr");
    totalsRow.className = "totals";
    totalsRow.appendChild(cell("td", "Total"));
    headings.forEach((heading, index) => {
      const value = cell("td", String(columnTotals[index]));
      value.dataset.year = heading;
      value.dataset.total = "column";
      totalsRow.appendChild(value);
    });
    const grandCell = cell("td", String(grand));
    grandCell.dataset.total = "all";
    grandCell.className = "row-total";
    totalsRow.appendChild(grandCell);
    body.appendChild(totalsRow);
    table.appendChild(body);
    root.replaceChildren(table);
  }

  function cornerKey(mode, point) {
    return `${mode}::${point.district || ""}::${point.city || ""}::${point.corner}`;
  }

  function sumSelectedYears(yearMap) {
    let total = 0;
    for (const heading of state.years) {
      total += Number(yearMap?.[heading]) || 0;
    }
    return total;
  }

  function displayedCornerCount(point) {
    return cornerCount.displayedCornerCount(point, {
      ageGroups: state.ageGroups,
      severity: state.severity,
      years: state.years,
    });
  }

  function modesToShow() {
    if (state.mode === "all") {
      return ["pedestrian", "bicyclist"];
    }
    return [state.mode];
  }

  const FATALITY_FILL = "#c0122f";
  const INJURY_FILL = "#e08a00";

  function compareYearHeadings(left, right) {
    const parse = (heading) => {
      const match = /^(\d{4})(P)?$/.exec(String(heading));
      if (!match) {
        return [Number.POSITIVE_INFINITY, 0, String(heading)];
      }
      return [Number(match[1]), match[2] ? 1 : 0, ""];
    };
    const a = parse(left);
    const b = parse(right);
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
  }

  function severityYearCounts(point) {
    if (state.severity === "killed") {
      if (ageFilterActive() && point.killed_age_years) {
        return sumAgeYearMaps(point.killed_age_years);
      }
      return point.killed_years;
    }
    if (state.severity === "serious") {
      if (ageFilterActive() && point.serious_age_years) {
        return sumAgeYearMaps(point.serious_age_years);
      }
      return point.serious_years;
    }
    if (ageFilterActive() && point.age_years) {
      return sumAgeYearMaps(point.age_years);
    }
    return point.year_counts;
  }

  function incidentYearPairs(point) {
    const counts = severityYearCounts(point) || {};
    return Object.keys(counts)
      .filter((heading) => {
        if (state.years.length && !state.years.includes(heading)) {
          return false;
        }
        return (Number(counts[heading]) || 0) > 0;
      })
      .sort(compareYearHeadings)
      .map((heading) => `${heading}-${Number(counts[heading])}`);
  }

  function killedInView(point) {
    if (!point) {
      return 0;
    }
    if (state.years.length) {
      if (ageFilterActive() && point.killed_age_years) {
        return sumSelectedYears(sumAgeYearMaps(point.killed_age_years));
      }
      return sumSelectedYears(point.killed_years);
    }
    if (ageFilterActive() && point.killed_age_years) {
      const counts = sumAgeYearMaps(point.killed_age_years);
      return Object.values(counts).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
    }
    return Number(point.killed) || 0;
  }

  function cornerFillColor(point) {
    if (state.severity === "serious") {
      return INJURY_FILL;
    }
    if (state.severity === "killed" || killedInView(point) > 0) {
      return FATALITY_FILL;
    }
    return INJURY_FILL;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function cornerPopup(point, mode) {
    const lines = [escapeHtml(point.corner)];
    const pairs = incidentYearPairs(point);
    if (pairs.length && mode === "pedestrian") {
      lines.push(`Pedestrian - ${pairs.join(", ")}`);
    }
    if (pairs.length && mode === "bicyclist") {
      lines.push(`Bicycle: ${pairs.join(", ")}`);
    }
    return lines.join("<br>");
  }

  function cornerMatchesGeography(point) {
    if (state.mode === "bicyclist" && state.geography === "street") {
      const street = state.streetDocument?.street;
      if (!street) {
        return false;
      }
      return point.primary_rd === street;
    }
    if (state.places.length === 0) {
      return true;
    }
    const district = String(point.district || "");
    if (state.places.includes(district)) {
      return true;
    }
    const city = String(point.city || "");
    return city !== "" && state.places.includes(city);
  }

  function refreshCornerVisibility() {
    if (!state.cornerLayer) {
      return;
    }
    for (const [key, marker] of state.cornerMarkers) {
      const point = state.cornerPointsByName.get(key);
      const pointMode = state.cornerModeByName.get(key);
      const modeMatch = modesToShow().includes(pointMode);
      const inGeography = point ? cornerMatchesGeography(point) : false;
      const count = displayedCornerCount(point);
      const inAgeGroup = !point || !ageFilterActive() || !point.groups || count > 0;
      const visible = modeMatch && inGeography && inAgeGroup && count > 0;
      if (point) {
        marker.setRadius(6 + count);
        marker.setStyle({ fillColor: cornerFillColor(point) });
        marker.setPopupContent(cornerPopup(point, pointMode));
      }
      if (visible) {
        if (!state.cornerLayer.hasLayer(marker)) {
          marker.addTo(state.cornerLayer);
        }
      } else if (state.cornerLayer.hasLayer(marker)) {
        state.cornerLayer.removeLayer(marker);
      }
    }
  }

  function clearSelection() {
    state.years = [];
    state.shownCities = [];
    applyPlaces([]);
  }

  function clearCityRows() {
    setShownCities([]);
  }

  function selectAllDistricts() {
    applyPlaces(placeSelection.selectAllDistricts(state.places, activeDocument().districts));
  }

  function unselectAllDistricts() {
    applyPlaces(placeSelection.deselectAllDistricts(state.places));
  }

  function togglePlace(place) {
    const next = state.places.includes(place)
      ? state.places.filter((item) => item !== place)
      : [...state.places, place];
    applyPlaces(next);
  }

  function toggleYear(year) {
    const next = state.years.includes(year)
      ? state.years.filter((item) => item !== year)
      : [...state.years, year];
    setYears(next);
  }

  function selectDistrict(place) {
    applyPlaces([place]);
  }

  function streetPointLatLngs(street) {
    const latlngs = [];
    for (const [key, point] of state.cornerPointsByName) {
      if (state.cornerModeByName.get(key) !== "bicyclist") {
        continue;
      }
      if (point.primary_rd !== street) {
        continue;
      }
      if (point.lat == null || point.lng == null) {
        continue;
      }
      latlngs.push([Number(point.lat), Number(point.lng)]);
    }
    return latlngs;
  }

  function fitStreetPoints() {
    if (!state.map || state.mode !== "bicyclist" || state.geography !== "street") {
      return;
    }
    const street = state.streetDocument?.street;
    if (!street) {
      return;
    }
    const latlngs = streetPointLatLngs(street);
    if (latlngs.length === 0) {
      return;
    }
    state.map.fitBounds(L.latLngBounds(latlngs), {
      padding: FIT_PADDING,
      animate: false,
    });
  }

  function fitSelectedPlaces() {
    const layers = state.places
      .map((place) => state.layersByDistrict.get(place))
      .filter((layer) => layer);
    if (!state.map || layers.length === 0) {
      if (state.places.length === 0) {
        fitAllDistricts();
      }
      return;
    }
    if (layers.length === 1) {
      state.map.fitBounds(layers[0].getBounds(), { padding: FIT_PADDING, animate: false });
      return;
    }
    const bounds = L.latLngBounds(layers[0].getBounds().getSouthWest(), layers[0].getBounds().getNorthEast());
    for (const layer of layers.slice(1)) {
      bounds.extend(layer.getBounds());
    }
    state.map.fitBounds(bounds, { padding: FIT_PADDING, animate: false });
  }

  function applyPlaces(places) {
    const requested = places.filter(Boolean);
    const cityAdds = requested.filter(
      (place) => state.cityPlaces.has(place) && !state.shownCities.includes(place),
    );
    if (cityAdds.length) {
      state.shownCities = [...new Set([...state.shownCities, ...cityAdds])].sort();
      syncCitySuggestions();
    }
    const allowed = new Set(allPlaces(activeDocument()));
    state.places = requested.filter((place) => allowed.has(place));
    state.streetDocument = null;
    clearSelectedSchool();
    clearSelectedPark();
    if (state.rateMode && state.places.length) {
      state.rateMode = false;
      documentElement("rate-mode").checked = false;
    }
    renderYearTotals();
    syncRateOptionVisibility();
    refreshChoropleth();
    refreshCornerVisibility();
    refreshPaintedCrosswalks();
    refreshHin();
    refreshCorridors();
    refreshMobilityPlan();
    refreshSchoolRadius();
    refreshParkRadius();
    fitSelectedPlaces();
  }

  function renderSidebar() {
    if (state.streetDocument) {
      renderStreetAgeTable(state.streetDocument);
      return;
    }
    renderYearTotals();
  }

  function syncAgeGroupButtons() {
    const root = documentElement("age-group-select");
    for (const button of root.querySelectorAll("[data-value]")) {
      const value = button.dataset.value;
      const selected =
        value === "All ages" ? !ageFilterActive() : state.ageGroups.includes(value);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function setAgeGroups(ageGroups) {
    state.ageGroups = [...ageGroups];
    syncAgeGroupButtons();
    renderSidebar();
    refreshChoropleth();
    refreshCornerVisibility();
    refreshSchoolRadiusSummary();
    refreshParkRadiusSummary();
  }

  function setAgeGroup(ageGroup) {
    setAgeGroups(ageGroup ? [ageGroup] : []);
  }

  function toggleAgeGroup(value) {
    if (value === "All ages") {
      setAgeGroups([]);
      return;
    }
    if (state.ageGroups.includes(value)) {
      const next = state.ageGroups.filter((label) => label !== value);
      setAgeGroups(next);
      return;
    }
    setAgeGroups([...state.ageGroups, value]);
  }

  function setYears(years) {
    const allowed = new Set(activeDocument().year_headings);
    state.years = years.filter((year) => allowed.has(year));
    renderSidebar();
    refreshChoropleth();
    refreshCornerVisibility();
    refreshSchoolRadiusSummary();
    refreshParkRadiusSummary();
  }

  function syncSegment(groupId, value) {
    for (const button of documentElement(groupId).querySelectorAll("[data-value]")) {
      const selected = button.dataset.value === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function syncGeographyControls() {
    const geographyField = documentElement("geography-field");
    const streetSearch = documentElement("street-search");
    const bicyclist = state.mode === "bicyclist";
    geographyField.hidden = !bicyclist;
    if (!bicyclist) {
      state.geography = "district";
      syncSegment("geography-select", "district");
      streetSearch.hidden = true;
      return;
    }
    syncSegment("geography-select", state.geography);
    streetSearch.hidden = state.geography !== "street";
  }

  function clearStreetResult() {
    const hadStreet = Boolean(state.streetDocument);
    state.streetDocument = null;
    const input = documentElement("street-search-input");
    input.value = "";
    if (hadStreet) {
      fitSelectedPlaces();
    }
  }

  function setBicyclistDocument(document) {
    state.bicyclistDocument = document;
    if (state.mode === "bicyclist" || state.mode === "all") {
      renderSidebar();
      refreshChoropleth();
      refreshCornerVisibility();
    }
  }

  function setMode(mode) {
    if (mode === "bicyclist" || mode === "all") {
      state.mode = mode;
    } else {
      state.mode = "pedestrian";
    }
    syncSegment("mode-select", state.mode);
    if (state.mode !== "bicyclist") {
      state.geography = "district";
      clearStreetResult();
    }
    const places = new Set(allPlaces(activeDocument()));
    state.places = state.places.filter((place) => places.has(place));
    const headings = new Set(activeDocument().year_headings);
    state.years = state.years.filter((year) => headings.has(year));
    syncGeographyControls();
    renderSidebar();
    refreshChoropleth();
    refreshCornerVisibility();
    refreshSchoolRadiusSummary();
    refreshParkRadiusSummary();
  }

  function setGeography(geography) {
    state.geography = geography === "street" ? "street" : "district";
    if (state.geography === "district") {
      clearStreetResult();
    }
    syncGeographyControls();
    renderSidebar();
    refreshChoropleth();
    refreshCornerVisibility();
  }

  function refreshPaintedCrosswalks() {
    if (!state.paintedLayer || !state.map) {
      return;
    }
    if (!state.paintedCrosswalks) {
      if (state.map.hasLayer(state.paintedLayer)) {
        state.map.removeLayer(state.paintedLayer);
      }
      return;
    }
    if (!state.map.hasLayer(state.paintedLayer)) {
      state.paintedLayer.addTo(state.map);
    }
    for (const [name, marker] of state.paintedMarkers) {
      const district = state.paintedDistricts.get(name);
      const show = state.places.length === 0 || state.places.includes(district);
      if (show) {
        if (!state.paintedLayer.hasLayer(marker)) {
          marker.addTo(state.paintedLayer);
        }
      } else if (state.paintedLayer.hasLayer(marker)) {
        state.paintedLayer.removeLayer(marker);
      }
    }
  }

  function syncSafetyImprovements() {
    const selectedByValue = {
      pvz: state.paintedCrosswalks,
      hin: state.hin2024,
      corridors: state.safetyCorridors2024,
      schools: state.schools,
      parks: state.parks,
      mobility: state.mobilityPlanOn,
    };
    for (const button of documentElement("painted-crosswalk-select").querySelectorAll(
      "[data-value]",
    )) {
      const selected = Boolean(selectedByValue[button.dataset.value]);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  function setPaintedCrosswalks(enabled) {
    state.paintedCrosswalks = Boolean(enabled);
    syncSafetyImprovements();
    refreshPaintedCrosswalks();
  }

  function toggleSafetyImprovement(value) {
    if (value === "pvz") {
      if (!state.pvzEnabled) {
        return;
      }
      setPaintedCrosswalks(!state.paintedCrosswalks);
      return;
    }
    if (value === "hin") {
      if (!state.hinEnabled) {
        return;
      }
      state.hin2024 = !state.hin2024;
      syncSafetyImprovements();
      refreshHin();
      return;
    }
    if (value === "corridors") {
      if (!state.safetyCorridorsEnabled) {
        return;
      }
      state.safetyCorridors2024 = !state.safetyCorridors2024;
      syncSafetyImprovements();
      refreshCorridors();
      return;
    }
    if (value === "schools") {
      if (!state.schoolsEnabled) {
        return;
      }
      state.schools = !state.schools;
      syncSafetyImprovements();
      refreshSchoolRadius();
      renderSidebar();
      return;
    }
    if (value === "parks") {
      if (!state.parksEnabled) {
        return;
      }
      state.parks = !state.parks;
      syncSafetyImprovements();
      refreshParkRadius();
      return;
    }
    if (value === "mobility") {
      if (!state.mobilityPlanEnabled) {
        return;
      }
      state.mobilityPlanOn = !state.mobilityPlanOn;
      syncSafetyImprovements();
      refreshMobilityPlan();
    }
  }

  function geoJsonToClipping(geometry) {
    if (!geometry) {
      return [];
    }
    if (geometry.type === "Polygon") {
      return [geometry.coordinates];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }
    return [];
  }

  function clippingToGeoJson(clipped) {
    if (!clipped || clipped.length === 0) {
      return null;
    }
    if (clipped.length === 1) {
      return { type: "Polygon", coordinates: clipped[0] };
    }
    return { type: "MultiPolygon", coordinates: clipped };
  }

  function layerToClipping(layer) {
    const polygons = [];
    const collect = (target) => {
      if (!target) {
        return;
      }
      if (target.feature?.geometry) {
        polygons.push(...geoJsonToClipping(target.feature.geometry));
        return;
      }
      if (typeof target.getLatLngs === "function") {
        const latlngs = target.getLatLngs();
        const rings = (Array.isArray(latlngs[0]) && latlngs[0][0]?.lat != null
          ? latlngs
          : [latlngs]
        ).map((ring) => ring.map((point) => [point.lng, point.lat]));
        if (rings.length && rings[0].length >= 3) {
          polygons.push(rings);
        }
        return;
      }
      if (typeof target.eachLayer === "function") {
        target.eachLayer(collect);
      }
    };
    collect(layer);
    return polygons;
  }

  function schoolRadiusGeometryForDraw() {
    const document = state.schoolRadiusDocument;
    if (!document?.geometry) {
      return null;
    }
    if (state.places.length === 0) {
      return document.geometry;
    }
    const school = geoJsonToClipping(document.geometry);
    const placePolygons = [];
    for (const place of state.places) {
      const layer = state.layersByDistrict.get(place);
      if (layer) {
        placePolygons.push(...layerToClipping(layer));
      }
    }
    if (!school.length || !placePolygons.length || typeof polygonClipping === "undefined") {
      return null;
    }
    try {
      const clipped = polygonClipping.intersection(school, placePolygons);
      return clippingToGeoJson(clipped);
    } catch (_error) {
      return null;
    }
  }

  function clearListedSchoolRadii() {
    if (state.listedSchoolRadiusLayer && state.map) {
      state.map.removeLayer(state.listedSchoolRadiusLayer);
    }
    state.listedSchoolRadiusLayer = null;
  }

  function refreshListedSchoolRadii(rows) {
    clearListedSchoolRadii();
    if (!state.map || !state.schools || !state.schoolsDocument || !rows?.length) {
      return;
    }
    const features = [];
    for (const row of rows) {
      const school = (state.schoolsDocument.schools || []).find((item) => item.name === row.name);
      if (!school?.radius_geometry) {
        continue;
      }
      features.push({
        type: "Feature",
        properties: { name: row.name },
        geometry: school.radius_geometry,
      });
    }
    if (!features.length) {
      return;
    }
    state.listedSchoolRadiusLayer = L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: {
          color: "#66bb6a",
          weight: 0,
          opacity: 0,
          fillColor: "#66bb6a",
          fillOpacity: 0.15,
          interactive: false,
        },
      },
    );
    state.listedSchoolRadiusLayer.addTo(state.map);
    state.listedSchoolRadiusLayer.bringToFront();
  }

  function schoolRadiusModeKey() {
    if (state.mode === "bicyclist") {
      return "bicyclist";
    }
    if (state.mode === "all") {
      return "all";
    }
    return "pedestrian";
  }

  function refreshSchoolRadiusSummary() {
    const root = documentElement("school-radius-summary");
    const text = documentElement("school-radius-summary-text");
    text.textContent = "";
    text.hidden = true;
    if (!state.schools || !state.schoolRadiusDocument) {
      root.hidden = true;
      refreshSchoolRadiusSchoolList();
      return;
    }
    refreshSchoolRadiusSchoolList();
    const note = documentElement("school-radius-school-note");
    const list = documentElement("school-radius-school-list");
    root.hidden = note.hidden && list.hidden;
  }

  function schoolRadiusSumSchoolRows(rowLists) {
    const sumRows =
      typeof CornersSchoolList !== "undefined" && CornersSchoolList.sumSchoolRows
        ? CornersSchoolList.sumSchoolRows
        : (lists) => {
            const totals = new Map();
            for (const rows of lists) {
              for (const row of rows || []) {
                totals.set(row.name, (totals.get(row.name) || 0) + Number(row.count || 0));
              }
            }
            return [...totals.entries()].map(([name, count]) => ({ name, count }));
          };
    return sumRows(rowLists).sort(
      (a, b) => Number(b.count) - Number(a.count) || String(a.name).localeCompare(String(b.name)),
    );
  }

  function schoolRadiusAgeRows(schools, key, ageLabels) {
    return schoolRadiusSumSchoolRows(
      ageLabels.map((age) => schools.by_age?.[age]?.[key] || []),
    );
  }

  function schoolRadiusCatalogRows(schools, key, district, yearHeadings) {
    const ageLabels = ageFilterActive() ? state.ageGroups : null;
    if (district && yearHeadings && ageLabels) {
      if (schools.by_district_year_age) {
        return schoolRadiusSumSchoolRows(
          yearHeadings.flatMap((year) =>
            ageLabels.map(
              (age) => schools.by_district_year_age?.[district]?.[year]?.[age]?.[key] || [],
            ),
          ),
        );
      }
      // Campus district matches the selected place; year filter waits on by_district_year_age.
      return schoolRadiusAgeRows(schools, key, ageLabels).filter(
        (row) => row.district === district,
      );
    }
    if (district && ageLabels) {
      if (schools.by_district_age) {
        return schoolRadiusSumSchoolRows(
          ageLabels.map((age) => schools.by_district_age?.[district]?.[age]?.[key] || []),
        );
      }
      return schoolRadiusAgeRows(schools, key, ageLabels).filter(
        (row) => row.district === district,
      );
    }
    if (yearHeadings && ageLabels) {
      if (schools.by_year_age) {
        return schoolRadiusSumSchoolRows(
          yearHeadings.flatMap((year) =>
            ageLabels.map((age) => schools.by_year_age?.[year]?.[age]?.[key] || []),
          ),
        );
      }
      // Prefer age ranks over an empty list when year×age is not published yet.
      return schoolRadiusAgeRows(schools, key, ageLabels);
    }
    if (ageLabels) {
      return schoolRadiusAgeRows(schools, key, ageLabels);
    }
    let rows = schools.all?.[key] || [];
    if (district && yearHeadings) {
      rows = schoolRadiusSumSchoolRows(
        yearHeadings.map((year) => schools.by_district_year?.[district]?.[year]?.[key] || []),
      );
    } else if (district) {
      rows = schools.by_district?.[district]?.[key] || [];
    } else if (yearHeadings) {
      rows = schoolRadiusSumSchoolRows(
        yearHeadings.map((year) => schools.by_year?.[year]?.[key] || []),
      );
    }
    return rows;
  }

  function schoolRadiusFilterDistrict(rows) {
    const placeLabels = state.places.filter((place) => place.startsWith("Council District"));
    if (placeLabels.length === 0) {
      return rows;
    }
    const selected = new Set(placeLabels);
    return (rows || []).filter((row) => selected.has(row.district));
  }

  function schoolRadiusListedSchools() {
    const modeKey = schoolRadiusModeKey();
    if (
      (modeKey !== "pedestrian" && modeKey !== "bicyclist" && modeKey !== "all") ||
      !state.schools
    ) {
      return null;
    }
    const yearHeadings = state.years.length
      ? state.years.map((year) => String(year).replace(/P$/, ""))
      : null;
    const placeLabels = state.places.filter((place) => place.startsWith("Council District"));
    const key = state.severity || "";
    // Multi-district: citywide catalog, then campus filter (same as parks).
    const district = placeLabels.length === 1 ? placeLabels[0] : null;
    let note = "";
    let rows = [];
    if (modeKey === "all") {
      const pedestrian = state.schoolRadiusDocument?.pedestrian?.schools;
      const bicyclist = state.schoolRadiusDocument?.bicyclist?.schools;
      if (!pedestrian || !bicyclist) {
        return null;
      }
      note = pedestrian.note || bicyclist.note || "";
      const sumRows =
        typeof CornersSchoolList !== "undefined" && CornersSchoolList.sumSchoolRows
          ? CornersSchoolList.sumSchoolRows
          : schoolRadiusSumSchoolRows;
      rows = schoolRadiusFilterDistrict(
        sumRows([
          schoolRadiusCatalogRows(pedestrian, key, district, yearHeadings),
          schoolRadiusCatalogRows(bicyclist, key, district, yearHeadings),
        ]),
      );
    } else {
      const schools = state.schoolRadiusDocument?.[modeKey]?.schools;
      if (!schools) {
        return null;
      }
      note = schools.note;
      rows = schoolRadiusFilterDistrict(
        schoolRadiusCatalogRows(schools, key, district, yearHeadings),
      );
    }
    const cutter =
      typeof CornersSchoolList !== "undefined" && CornersSchoolList.topSchools
        ? CornersSchoolList.topSchools
        : (list) => list;
    return { note, rows: cutter(rows) };
  }

  function clearSelectedSchool() {
    if (state.selectedSchoolRadiusLayer && state.map) {
      state.map.removeLayer(state.selectedSchoolRadiusLayer);
    }
    if (state.selectedSchoolMarker && state.map) {
      state.map.removeLayer(state.selectedSchoolMarker);
    }
    state.selectedSchoolRadiusLayer = null;
    state.selectedSchoolMarker = null;
    state.selectedSchoolName = null;
    state.selectedSchoolCount = null;
  }

  function focusSchool(name, count) {
    if (!state.map || !state.schoolsDocument) {
      return;
    }
    const school = (state.schoolsDocument.schools || []).find((row) => row.name === name);
    if (!school?.centroid || !school?.radius_geometry) {
      return;
    }
    clearSelectedSchool();
    state.selectedSchoolName = name;
    state.selectedSchoolCount = count;
    state.selectedSchoolRadiusLayer = L.geoJSON(school.radius_geometry, {
      style: {
        color: "#1b5e20",
        weight: 3,
        fillColor: "#81c784",
        fillOpacity: 0.25,
        interactive: false,
      },
    });
    state.selectedSchoolRadiusLayer.addTo(state.map);
    const marker = L.marker([school.centroid.lat, school.centroid.lng]);
    marker.bindPopup(`${name}: ${count}`);
    marker.addTo(state.map);
    marker.openPopup();
    state.selectedSchoolMarker = marker;
    state.map.fitBounds(state.selectedSchoolRadiusLayer.getBounds(), {
      padding: FIT_PADDING,
      animate: false,
    });
  }

  function refreshSchoolRadiusSchoolList() {
    const note = documentElement("school-radius-school-note");
    const list = documentElement("school-radius-school-list");
    const shown = schoolRadiusListedSchools();
    if (!shown) {
      note.hidden = true;
      note.textContent = "";
      list.hidden = true;
      list.replaceChildren();
      clearSelectedSchool();
      clearListedSchoolRadii();
      return;
    }
    if (
      state.selectedSchoolName &&
      !shown.rows.some((row) => row.name === state.selectedSchoolName)
    ) {
      clearSelectedSchool();
    }
    note.hidden = false;
    note.textContent = shown.note;
    list.hidden = false;
    list.replaceChildren(
      ...shown.rows.map((row) => {
        const item = document.createElement("li");
        item.dataset.school = row.name;
        const name = document.createElement("a");
        name.href = "#";
        name.className = "school-name";
        const label =
          typeof CornersSchoolList !== "undefined" && CornersSchoolList.formatSchoolName
            ? CornersSchoolList.formatSchoolName(row)
            : row.district
              ? `${row.name} (${row.district})`
              : row.name;
        name.textContent = label;
        name.addEventListener("click", (event) => {
          event.preventDefault();
          focusSchool(row.name, row.count);
        });
        const count = document.createElement("span");
        count.className = "school-count";
        count.textContent = String(row.count);
        item.append(name, document.createTextNode(" "), count);
        return item;
      }),
    );
    refreshListedSchoolRadii(shown.rows);
  }

  function refreshSchoolRadius() {
    if (!state.map) {
      refreshSchoolRadiusSummary();
      return;
    }
    if (state.schoolRadiusLayer) {
      state.map.removeLayer(state.schoolRadiusLayer);
      state.schoolRadiusLayer = null;
    }
    clearListedSchoolRadii();
    if (!state.schools) {
      clearSelectedSchool();
      refreshSchoolRadiusSummary();
      return;
    }
    const geometry = schoolRadiusGeometryForDraw();
    if (geometry) {
      state.schoolRadiusLayer = L.geoJSON(geometry, {
        style: {
          color: "#2e7d32",
          weight: 2,
          fillColor: "#66bb6a",
          fillOpacity: 0.2,
          interactive: false,
        },
      });
      state.schoolRadiusLayer.addTo(state.map);
      state.schoolRadiusLayer.bringToFront();
    }
    refreshSchoolRadiusSummary();
  }

  async function loadSchoolRadiusDocument() {
    const document = await fetchJson(schoolRadiusDocumentUrl, { optional: true }).catch(
      () => null,
    );
    state.schoolRadiusDocument = document;
  }

  function parkRadiusGeometryForDraw() {
    const document = state.parkRadiusDocument;
    if (!document?.geometry) {
      return null;
    }
    if (state.places.length === 0) {
      return document.geometry;
    }
    const park = geoJsonToClipping(document.geometry);
    const placePolygons = [];
    for (const place of state.places) {
      const layer = state.layersByDistrict.get(place);
      if (layer) {
        placePolygons.push(...layerToClipping(layer));
      }
    }
    if (!park.length || !placePolygons.length || typeof polygonClipping === "undefined") {
      return null;
    }
    try {
      const clipped = polygonClipping.intersection(park, placePolygons);
      return clippingToGeoJson(clipped);
    } catch (_error) {
      return null;
    }
  }

  function clearSelectedPark() {
    if (state.selectedParkRadiusLayer && state.map) {
      state.map.removeLayer(state.selectedParkRadiusLayer);
    }
    if (state.selectedParkMarker && state.map) {
      state.map.removeLayer(state.selectedParkMarker);
    }
    state.selectedParkRadiusLayer = null;
    state.selectedParkMarker = null;
    state.selectedParkName = null;
    state.selectedParkCount = null;
  }

  function focusPark(name, count) {
    if (!state.map || !state.parksDocument) {
      return;
    }
    const park = (state.parksDocument.parks || []).find((row) => row.name === name);
    if (!park?.centroid || !park?.radius_geometry) {
      return;
    }
    clearSelectedPark();
    state.selectedParkName = name;
    state.selectedParkCount = count;
    state.selectedParkRadiusLayer = L.geoJSON(park.radius_geometry, {
      style: {
        color: "#004d40",
        weight: 3,
        fillColor: "#80cbc4",
        fillOpacity: 0.35,
        interactive: false,
      },
    });
    state.selectedParkRadiusLayer.addTo(state.map);
    const marker = L.marker([park.centroid.lat, park.centroid.lng]);
    marker.bindPopup(`${name}: ${count}`);
    marker.addTo(state.map);
    marker.openPopup();
    state.selectedParkMarker = marker;
    state.map.fitBounds(state.selectedParkRadiusLayer.getBounds(), {
      padding: FIT_PADDING,
      animate: false,
    });
  }

  function clearListedParkRadii() {
    if (state.listedParkRadiusLayer && state.map) {
      state.map.removeLayer(state.listedParkRadiusLayer);
    }
    state.listedParkRadiusLayer = null;
  }

  function refreshListedParkRadii(rows) {
    clearListedParkRadii();
    if (!state.map || !state.parks || !state.parksDocument || !rows?.length) {
      return;
    }
    const features = [];
    for (const row of rows) {
      const park = (state.parksDocument.parks || []).find((item) => item.name === row.name);
      if (!park?.radius_geometry) {
        continue;
      }
      features.push({
        type: "Feature",
        properties: { name: row.name },
        geometry: park.radius_geometry,
      });
    }
    if (!features.length) {
      return;
    }
    state.listedParkRadiusLayer = L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: {
          color: "#4db6ac",
          weight: 0,
          opacity: 0,
          fillColor: "#4db6ac",
          fillOpacity: 0.15,
          interactive: false,
        },
      },
    );
    state.listedParkRadiusLayer.addTo(state.map);
    state.listedParkRadiusLayer.bringToFront();
  }

  function parkRadiusSumParkRows(rowLists) {
    const sumRows =
      typeof CornersParkList !== "undefined" && CornersParkList.sumParkRows
        ? CornersParkList.sumParkRows
        : (lists) => {
            const totals = new Map();
            for (const rows of lists) {
              for (const row of rows || []) {
                totals.set(row.name, (totals.get(row.name) || 0) + Number(row.count || 0));
              }
            }
            return [...totals.entries()].map(([name, count]) => ({ name, count }));
          };
    return sumRows(rowLists);
  }

  function parkRadiusCatalogRows(parks, key, yearHeadings) {
    const ageLabels = ageFilterActive() ? state.ageGroups : null;
    if (ageLabels && parks.by_age && !(yearHeadings && parks.by_year)) {
      return parkRadiusSumParkRows(
        ageLabels.map((age) => parks.by_age?.[age]?.[key] || []),
      );
    }
    if (yearHeadings && parks.by_year) {
      return parkRadiusSumParkRows(
        yearHeadings.map((year) => parks.by_year?.[year]?.[key] || []),
      );
    }
    return parks.all?.[key] || [];
  }

  function parkRadiusFilterDistrict(rows) {
    const placeLabels = state.places.filter((place) => place.startsWith("Council District"));
    if (placeLabels.length === 0) {
      return rows;
    }
    const selected = new Set(placeLabels);
    return (rows || []).filter((row) => selected.has(row.district));
  }

  function parkRadiusListedParks() {
    if (
      !state.parks ||
      (state.mode !== "pedestrian" && state.mode !== "bicyclist" && state.mode !== "all")
    ) {
      return null;
    }
    const key = state.severity || "";
    const yearHeadings = state.years.length
      ? state.years.map((year) => String(year).replace(/P$/, ""))
      : null;
    const cutter =
      typeof CornersParkList !== "undefined" && CornersParkList.topParks
        ? CornersParkList.topParks
        : (list) => list;
    if (state.mode === "all") {
      const pedestrian = state.parkRadiusDocument?.pedestrian?.parks;
      const bicyclist = state.parkRadiusDocument?.bicyclist?.parks;
      if (!pedestrian || !bicyclist) {
        return null;
      }
      const rows = parkRadiusFilterDistrict(
        parkRadiusSumParkRows([
          parkRadiusCatalogRows(pedestrian, key, yearHeadings),
          parkRadiusCatalogRows(bicyclist, key, yearHeadings),
        ]),
      );
      return { rows: cutter(rows) };
    }
    const parks = state.parkRadiusDocument?.[state.mode]?.parks;
    if (!parks) {
      return null;
    }
    const rows = parkRadiusFilterDistrict(parkRadiusCatalogRows(parks, key, yearHeadings));
    return { rows: cutter(rows) };
  }

  function refreshParkRadiusParkList() {
    const list = documentElement("park-radius-park-list");
    const shown = parkRadiusListedParks();
    if (!shown) {
      list.hidden = true;
      list.replaceChildren();
      clearSelectedPark();
      clearListedParkRadii();
      return;
    }
    if (
      state.selectedParkName &&
      !shown.rows.some((row) => row.name === state.selectedParkName)
    ) {
      clearSelectedPark();
    }
    list.hidden = false;
    list.replaceChildren(
      ...shown.rows.map((row) => {
        const item = document.createElement("li");
        item.dataset.park = row.name;
        const name = document.createElement("a");
        name.href = "#";
        name.className = "park-name";
        const label =
          typeof CornersParkList !== "undefined" && CornersParkList.formatParkName
            ? CornersParkList.formatParkName(row)
            : row.district
              ? `${row.name} (${row.district})`
              : row.name;
        name.textContent = label;
        name.addEventListener("click", (event) => {
          event.preventDefault();
          focusPark(row.name, row.count);
        });
        const count = document.createElement("span");
        count.className = "park-count";
        count.textContent = String(row.count);
        item.append(name, document.createTextNode(" "), count);
        return item;
      }),
    );
    refreshListedParkRadii(shown.rows);
  }

  function refreshParkRadiusSummary() {
    const root = documentElement("park-radius-summary");
    const text = documentElement("park-radius-summary-text");
    const note = documentElement("park-radius-park-note");
    text.textContent = "";
    text.hidden = true;
    if (!state.parks || !state.parkRadiusDocument) {
      root.hidden = true;
      note.hidden = true;
      note.textContent = "";
      refreshParkRadiusParkList();
      return;
    }
    note.hidden = false;
    note.textContent = state.parkRadiusDocument.note || "";
    refreshParkRadiusParkList();
    const list = documentElement("park-radius-park-list");
    root.hidden = note.hidden && list.hidden;
  }

  function refreshParkRadius() {
    if (!state.map) {
      refreshParkRadiusSummary();
      return;
    }
    if (state.parkRadiusLayer) {
      state.map.removeLayer(state.parkRadiusLayer);
      state.parkRadiusLayer = null;
    }
    clearListedParkRadii();
    if (!state.parks) {
      clearSelectedPark();
      refreshParkRadiusSummary();
      return;
    }
    const geometry = parkRadiusGeometryForDraw();
    if (geometry) {
      state.parkRadiusLayer = L.geoJSON(geometry, {
        style: {
          color: "#00695c",
          weight: 2,
          fillColor: "#4db6ac",
          fillOpacity: 0.2,
          interactive: false,
        },
      });
      state.parkRadiusLayer.addTo(state.map);
      state.parkRadiusLayer.bringToFront();
    }
    refreshParkRadiusSummary();
  }

  async function loadParkRadiusDocument() {
    const document = await fetchJson(parkRadiusDocumentUrl, { optional: true }).catch(
      () => null,
    );
    state.parkRadiusDocument = document;
  }

  async function loadParksDocument() {
    const document = await fetchJson(parksDocumentUrl, { optional: true }).catch(() => null);
    state.parksDocument = document;
  }

  async function loadSchoolsDocument() {
    const document = await fetchJson(schoolsDocumentUrl, { optional: true }).catch(() => null);
    state.schoolsDocument = document;
  }

  function setSeverity(severity) {
    state.severity = severity || "";
    syncSegment("severity-select", state.severity);
    renderSidebar();
    refreshChoropleth();
    refreshCornerVisibility();
    refreshSchoolRadiusSummary();
    refreshParkRadiusSummary();
  }

  function setRateMode(enabled) {
    state.rateMode = Boolean(enabled);
    const checkbox = documentElement("rate-mode");
    checkbox.checked = state.rateMode;
    refreshChoropleth();
  }

  function fillAgeGroupSelect(document) {
    const root = documentElement("age-group-select");
    const labels = document.district_age_totals
      ? Object.keys(Object.values(document.district_age_totals)[0] || {})
      : AGE_GROUP_LABELS;
    root.replaceChildren();
    const makeButton = (value, text) => {
      const button = window.document.createElement("button");
      button.type = "button";
      button.className = "segment age-chip";
      button.dataset.value = value;
      button.textContent = text;
      button.setAttribute("aria-pressed", "false");
      return button;
    };
    root.appendChild(makeButton("All ages", "All ages"));
    for (const label of labels) {
      root.appendChild(makeButton(label, label));
    }
    syncAgeGroupButtons();
  }

  function addCornerMarkers(pointsDocument, mode) {
    for (const point of pointsDocument.points || []) {
      const key = cornerKey(mode, point);
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 6 + displayedCornerCount(point),
        color: "#000",
        fillColor: cornerFillColor(point),
        fillOpacity: 0.75,
        weight: 0.5,
        opacity: 0.4,
      });
      marker.bindPopup(cornerPopup(point, mode));
      state.cornerMarkers.set(key, marker);
      state.cornerPointsByName.set(key, point);
      state.cornerDistrictByName.set(key, String(point.district || ""));
      state.cornerModeByName.set(key, mode);
    }
  }

  async function loadCornerPoints() {
    if (new URLSearchParams(window.location.search).get("points") !== "1") {
      return;
    }
    const [pointsDocument, bicyclistPointsDocument] = await Promise.all([
      fetchJson(cornerPointsUrl),
      fetchJson(bicyclistCornerPointsUrl, { optional: true }).catch(() => null),
    ]);
    state.cornerYearsByMode = {
      pedestrian: pointsDocument.years,
      bicyclist: bicyclistPointsDocument?.years || pointsDocument.years,
    };
    state.cornerYears = pointsDocument.years;
    const layer = L.layerGroup();
    state.cornerLayer = layer;
    addCornerMarkers(pointsDocument, "pedestrian");
    if (bicyclistPointsDocument) {
      addCornerMarkers(bicyclistPointsDocument, "bicyclist");
    }
    layer.addTo(state.map);
    refreshCornerVisibility();
  }

  function paintedCrosswalkIcon() {
    return L.divIcon({
      className: "painted-crosswalk",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function ensurePaintedPane(map) {
    if (map.getPane("painted-crosswalks")) {
      return;
    }
    const pane = map.createPane("painted-crosswalks");
    pane.style.zIndex = "620";
  }

  async function loadPaintedCrosswalks() {
    const document = await fetchJson(paintedCrosswalksUrl, { optional: true }).catch(() => null);
    if (!document || !state.map) {
      return;
    }
    ensurePaintedPane(state.map);
    const layer = L.layerGroup();
    state.paintedLayer = layer;
    for (const row of document.crosswalks || []) {
      const marker = L.marker([row.lat, row.lng], {
        icon: paintedCrosswalkIcon(),
        fillColor: "#ffffff",
        pane: "painted-crosswalks",
      });
      state.paintedMarkers.set(row.name, marker);
      state.paintedDistricts.set(row.name, String(row.district || ""));
      state.paintedShapes.set(row.name, "square");
      marker.addTo(layer);
    }
    layer.addTo(state.map);
    refreshPaintedCrosswalks();
  }

  const HIN_PINK = "#ff4da6";
  // NavigateLA Safety Corridors (2024) stroke [61,187,255]; keep above district fill #8ec8ff.
  const CORRIDOR_BLUE = "#3dbbff";
  const CORRIDOR_CASE = "#0b4f8a";

  function ensureSafetyLinesPane(map) {
    if (map.getPane("safety-lines")) {
      return;
    }
    const pane = map.createPane("safety-lines");
    // Above choropleth overlay (400), below markers (600) and painted squares (620).
    pane.style.zIndex = "450";
    // Canvas panes swallow clicks even for misses; lines have no popups yet.
    pane.style.pointerEvents = "none";
  }

  function pointNearRing(lat, lng, ring) {
    const epsilon = 1e-8;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const ax = ring[j].lng;
      const ay = ring[j].lat;
      const bx = ring[i].lng;
      const by = ring[i].lat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = 0;
      if (len2 > 0) {
        t = ((lng - ax) * dx + (lat - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
      }
      const distLng = lng - (ax + t * dx);
      const distLat = lat - (ay + t * dy);
      if (distLng * distLng + distLat * distLat <= epsilon * epsilon) {
        return true;
      }
    }
    return false;
  }

  function pointInRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const yi = ring[i].lat;
      const xi = ring[i].lng;
      const yj = ring[j].lat;
      const xj = ring[j].lng;
      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  function ringsFromLatLngs(latlngs) {
    if (!latlngs || !latlngs.length) {
      return [];
    }
    if (latlngs[0]?.lat != null) {
      return [latlngs];
    }
    if (latlngs[0]?.[0]?.lat != null) {
      return latlngs;
    }
    if (latlngs[0]?.[0]?.[0]?.lat != null) {
      return latlngs.flat();
    }
    return [];
  }

  function pointInLayer(latlng, layer) {
    if (layer.getLatLngs) {
      for (const ring of ringsFromLatLngs(layer.getLatLngs())) {
        if (ring[0]?.lat != null && pointInRing(latlng.lat, latlng.lng, ring)) {
          return true;
        }
      }
    }
    if (layer.eachLayer) {
      let hit = false;
      layer.eachLayer((part) => {
        if (!hit && pointInLayer(latlng, part)) {
          hit = true;
        }
      });
      return hit;
    }
    return false;
  }

  function pointInSelectedPlaces(latlng) {
    if (state.places.length === 0) {
      return true;
    }
    return state.places.some((place) => {
      const layer = state.layersByDistrict.get(place);
      return layer ? pointInLayer(latlng, layer) : false;
    });
  }

  function findExitPoint(inside, outside) {
    let lo = L.latLng(inside.lat, inside.lng);
    let hi = L.latLng(outside.lat, outside.lng);
    for (let i = 0; i < 24; i += 1) {
      const mid = L.latLng((lo.lat + hi.lat) / 2, (lo.lng + hi.lng) / 2);
      if (pointInSelectedPlaces(mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  function clipLineSegment(segment) {
    const endpoints = segment.endpoints || [];
    const points = (segment.polyline || []).map((pair) => L.latLng(pair[0], pair[1]));
    if (points.length < 2) {
      return null;
    }
    if (state.places.length === 0) {
      return { latlngs: points, endpoints: [...endpoints] };
    }
    const a = points[0];
    const b = points[points.length - 1];
    const aIn = pointInSelectedPlaces(a);
    const bIn = pointInSelectedPlaces(b);
    if (aIn && bIn) {
      return { latlngs: points, endpoints: [...endpoints] };
    }
    if (!aIn && !bIn) {
      return null;
    }
    if (aIn) {
      return {
        latlngs: [a, findExitPoint(a, b)],
        endpoints: endpoints[0] ? [endpoints[0]] : [],
      };
    }
    return {
      latlngs: [b, findExitPoint(b, a)],
      endpoints: endpoints[1] ? [endpoints[1]] : [],
    };
  }

  function refreshLineLayer({
    enabled,
    document,
    layerKey,
    drawnKey,
    color,
    colorFamily,
    weight = 5,
    caseColor = null,
  }) {
    if (!state.map) {
      return;
    }
    ensureSafetyLinesPane(state.map);
    if (!state[layerKey]) {
      state[layerKey] = L.layerGroup();
    }
    state[layerKey].clearLayers();
    state[drawnKey].clear();
    if (!enabled || !document) {
      if (state.map.hasLayer(state[layerKey])) {
        state.map.removeLayer(state[layerKey]);
      }
      return;
    }
    for (const segment of document.segments || []) {
      const clipped = clipLineSegment(segment);
      if (!clipped) {
        continue;
      }
      if (caseColor) {
        L.polyline(clipped.latlngs, {
          color: caseColor,
          weight: weight + 3,
          opacity: 0.9,
          pane: "safety-lines",
          interactive: false,
        }).addTo(state[layerKey]);
      }
      const line = L.polyline(clipped.latlngs, {
        color,
        weight,
        opacity: 0.95,
        pane: "safety-lines",
        // Keep clicks on district/city polygons under the line overlay.
        interactive: false,
      });
      line.addTo(state[layerKey]);
      state[drawnKey].set(segment.name, {
        colorFamily,
        endpoints: clipped.endpoints,
        color,
      });
    }
    if (!state.map.hasLayer(state[layerKey])) {
      state[layerKey].addTo(state.map);
    }
  }

  function refreshHin() {
    refreshLineLayer({
      enabled: state.hin2024,
      document: state.hinDocument,
      layerKey: "hinLayer",
      drawnKey: "hinDrawn",
      color: HIN_PINK,
      colorFamily: "pink",
      weight: 4,
    });
  }

  function refreshCorridors() {
    refreshLineLayer({
      enabled: state.safetyCorridors2024,
      document: state.safetyCorridorsDocument,
      layerKey: "corridorsLayer",
      drawnKey: "corridorsDrawn",
      color: CORRIDOR_BLUE,
      colorFamily: "blue",
      weight: 5,
      caseColor: CORRIDOR_CASE,
    });
  }

  const MOBILITY_PLAN_STYLES = {
    PED: { color: "#e67e22", colorFamily: "orange", label: "Pedestrian Enhanced District" },
    BEN: { color: "#2ecc71", colorFamily: "green", label: "Bicycle Enhanced Network" },
    BLN: { color: "#1abc9c", colorFamily: "teal", label: "Bicycle Lane Network" },
    NEN: { color: "#9b59b6", colorFamily: "purple", label: "Neighborhood Enhanced Network" },
  };
  const MOBILITY_PLAN_DRAWN_NETWORKS = new Set(["PED", "BEN", "BLN", "NEN"]);

  function syncMobilityPlanLegend() {
    if (!state.map) {
      return;
    }
    if (!state.mobilityPlanOn || !state.mobilityPlanEnabled) {
      if (state.mobilityPlanLegend) {
        state.map.removeControl(state.mobilityPlanLegend);
        state.mobilityPlanLegend = null;
      }
      return;
    }
    if (state.mobilityPlanLegend) {
      return;
    }
    const Legend = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const div = L.DomUtil.create("div", "mobility-plan-legend");
        div.setAttribute("data-testid", "mobility-plan-legend");
        div.innerHTML = [
          '<div class="mobility-plan-legend-title">Mobility Plan 2035</div>',
          ...Object.entries(MOBILITY_PLAN_STYLES).map(
            ([code, style]) =>
              `<div class="mobility-plan-legend-row" data-network="${code}">` +
              `<span class="mobility-plan-legend-swatch" style="background:${style.color}"></span>` +
              `<span class="mobility-plan-legend-code">${code}</span>` +
              `<span class="mobility-plan-legend-name">${style.label}</span>` +
              `</div>`,
          ),
        ].join("");
        L.DomEvent.disableClickPropagation(div);
        return div;
      },
    });
    state.mobilityPlanLegend = new Legend();
    state.map.addControl(state.mobilityPlanLegend);
  }

  function refreshMobilityPlan() {
    const layerKey = "mobilityPlanLayer";
    const drawnKey = "mobilityPlanDrawn";
    if (!state.map) {
      return;
    }
    ensureSafetyLinesPane(state.map);
    if (!state[layerKey]) {
      state[layerKey] = L.layerGroup();
    }
    state[layerKey].clearLayers();
    state[drawnKey].clear();
    if (!state.mobilityPlanOn || !state.mobilityPlanDocument) {
      if (state.map.hasLayer(state[layerKey])) {
        state.map.removeLayer(state[layerKey]);
      }
      syncMobilityPlanLegend();
      return;
    }
    for (const segment of state.mobilityPlanDocument.segments || []) {
      const network = segment.network;
      if (!MOBILITY_PLAN_DRAWN_NETWORKS.has(network)) {
        continue;
      }
      const style = MOBILITY_PLAN_STYLES[network];
      const clipped = clipLineSegment(segment);
      if (!clipped) {
        continue;
      }
      const line = L.polyline(clipped.latlngs, {
        color: style.color,
        weight: 4,
        opacity: 0.95,
        pane: "safety-lines",
        interactive: false,
      });
      line.addTo(state[layerKey]);
      state[drawnKey].set(segment.name, {
        colorFamily: style.colorFamily,
        endpoints: clipped.endpoints,
        color: style.color,
        network,
      });
    }
    if (!state.map.hasLayer(state[layerKey])) {
      state[layerKey].addTo(state.map);
    }
    syncMobilityPlanLegend();
  }

  async function loadMobilityPlanDocument() {
    const document = await fetchJson(mobilityPlanDocumentUrl, { optional: true }).catch(
      () => null,
    );
    state.mobilityPlanDocument = document;
    state.mobilityPlanReady = true;
    refreshMobilityPlan();
  }

  async function loadHinDocument() {
    const document = await fetchJson(hinDocumentUrl, { optional: true }).catch(() => null);
    state.hinDocument = document;
    state.hinReady = true;
    refreshHin();
  }

  async function loadSafetyCorridorsDocument() {
    const document = await fetchJson(safetyCorridorsDocumentUrl, { optional: true }).catch(
      () => null,
    );
    state.safetyCorridorsDocument = document;
    state.corridorsReady = true;
    refreshCorridors();
  }

  const AGE_GROUP_LABELS = [
    "Pre-k",
    "Elementary school age",
    "Middle school age",
    "High school age",
    "Adult",
    "Senior",
    "Unknown",
  ];

  function emptyAgeYears(headings) {
    const ageYears = {};
    for (const label of AGE_GROUP_LABELS) {
      ageYears[label] = Object.fromEntries(headings.map((heading) => [heading, 0]));
    }
    return ageYears;
  }

  function streetAgeYears(streetDocument) {
    if (state.severity === "killed") {
      return streetDocument.killed_age_years || null;
    }
    if (state.severity === "serious") {
      return streetDocument.serious_age_years || null;
    }
    return streetDocument.age_years;
  }

  function emptyStreetDocument(street, city) {
    const headings = state.document?.year_headings || [];
    return {
      street,
      city,
      year_headings: headings,
      age_years: emptyAgeYears(headings),
      killed_age_years: emptyAgeYears(headings),
      serious_age_years: emptyAgeYears(headings),
    };
  }

  function losAngelesStreetSuggestions() {
    if (!state.streetIndex) {
      return [];
    }
    return (state.streetIndex.streets || [])
      .filter((row) => row.city === "LOS ANGELES")
      .map((row) => row.street);
  }

  function fillStreetSuggestions() {
    const list = documentElement("street-suggestions");
    list.replaceChildren();
    for (const street of losAngelesStreetSuggestions()) {
      const option = document.createElement("option");
      option.value = street;
      list.appendChild(option);
    }
  }

  function streetMatchesSuggestion(street) {
    return losAngelesStreetSuggestions().includes(street);
  }

  async function searchStreet(street, city) {
    let streetDocument;
    if (state.streetIndex) {
      streetDocument =
        (state.streetIndex.streets || []).find(
          (row) => row.street === street && row.city === city,
        ) || emptyStreetDocument(street, city);
    } else {
      const loaded = await fetchJson(streetDocumentUrl);
      streetDocument =
        loaded.street === street && loaded.city === city
          ? loaded
          : emptyStreetDocument(street, city);
    }
    state.places = [];
    state.streetDocument = streetDocument;
    renderStreetAgeTable(streetDocument);
    refreshCornerVisibility();
    fitStreetPoints();
  }

  function searchStreetFromInput() {
    const street = documentElement("street-search-input").value.trim();
    searchStreet(street, "LOS ANGELES").catch((err) => {
      documentElement("sidebar-table").textContent = `Street search failed: ${err.message}`;
    });
  }

  function layerFlag(document, key) {
    return Boolean(document?.[key]);
  }

  function applySourceLineFlags(mapDocument) {
    const sources = window.document.querySelector('[data-testid="sources"]');
    if (!sources || typeof CornersSourceLines === "undefined") {
      return;
    }
    for (const item of sources.querySelectorAll("li[data-source]")) {
      item.hidden = CornersSourceLines.sourceLineHidden(mapDocument, item.dataset.source);
    }
  }

  function applySafetyZoneLayerFlags(document) {
    const hinEnabled = layerFlag(document, "hin_enabled");
    const corridorsEnabled = layerFlag(document, "safety_corridors_enabled");
    const schoolsEnabled = layerFlag(document, "schools_enabled");
    const parksEnabled = layerFlag(document, "parks_enabled");
    const pvzEnabled = layerFlag(document, "pvz_enabled");
    const mobilityPlanEnabled = layerFlag(document, "mobility_plan_enabled");
    state.hinEnabled = hinEnabled;
    state.safetyCorridorsEnabled = corridorsEnabled;
    state.schoolsEnabled = schoolsEnabled;
    state.parksEnabled = parksEnabled;
    state.pvzEnabled = pvzEnabled;
    state.mobilityPlanEnabled = mobilityPlanEnabled;
    state.paintedCrosswalks = pvzEnabled;
    applySourceLineFlags(document);
    for (const button of documentElement("painted-crosswalk-select").querySelectorAll(
      "[data-value]",
    )) {
      const value = button.dataset.value;
      if (value === "pvz") {
        button.hidden = !pvzEnabled;
      } else if (value === "hin") {
        button.hidden = !hinEnabled;
      } else if (value === "corridors") {
        button.hidden = !corridorsEnabled;
      } else if (value === "schools") {
        button.hidden = !schoolsEnabled;
      } else if (value === "parks") {
        button.hidden = !parksEnabled;
      } else if (value === "mobility") {
        button.hidden = !mobilityPlanEnabled;
      }
    }
  }

  async function main() {
    const document = await fetchJson(documentUrl);
    state.document = document;
    applySafetyZoneLayerFlags(document);

    documentElement("reset-selection").addEventListener("click", clearSelection);
    documentElement("show-all-districts").addEventListener("click", clearCityRows);
    documentElement("select-all-districts").addEventListener("click", selectAllDistricts);
    documentElement("unselect-all-districts").addEventListener("click", unselectAllDistricts);
    documentElement("table-measure").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        setTableMeasure(button.dataset.value);
      }
    });
    const rateToggle = documentElement("rate-mode");
    rateToggle.disabled = !document.rate_comparison;
    rateToggle.addEventListener("change", () => setRateMode(rateToggle.checked));
    if (new URLSearchParams(window.location.search).get("rate") === "1") {
      state.rateMode = true;
      rateToggle.checked = true;
    }

    state.bicyclistDocument = await fetchJson(bicyclistDocumentUrl, { optional: true }).catch(
      () => null,
    );

    fillAgeGroupSelect(document);
    documentElement("age-group-select").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        toggleAgeGroup(button.dataset.value);
      }
    });
    documentElement("mode-select").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        setMode(button.dataset.value);
      }
    });
    documentElement("geography-select").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        setGeography(button.dataset.value);
      }
    });
    documentElement("severity-select").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        setSeverity(button.dataset.value);
      }
    });
    documentElement("painted-crosswalk-select").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) {
        toggleSafetyImprovement(button.dataset.value);
      }
    });
    syncSafetyImprovements();
    syncGeographyControls();
    syncSegment("mode-select", state.mode);

    state.streetIndex = await fetchJson(streetIndexUrl, { optional: true }).catch(() => null);
    fillStreetSuggestions();

    documentElement("street-search").addEventListener("submit", (event) => {
      event.preventDefault();
      searchStreetFromInput();
    });
    documentElement("street-search-input").addEventListener("change", () => {
      const street = documentElement("street-search-input").value.trim();
      if (streetMatchesSuggestion(street)) {
        searchStreetFromInput();
      }
    });

    documentElement("city-row-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = documentElement("city-row-input");
      const place = input.value.trim();
      if (!place) {
        return;
      }
      toggleShownCity(place);
      input.value = "";
    });
    documentElement("city-row-input").addEventListener("change", () => {
      const place = documentElement("city-row-input").value.trim();
      if (comparisonCitiesAvailable().includes(place)) {
        documentElement("city-row-form").requestSubmit();
      }
    });
    documentElement("add-all-cities").addEventListener("click", () => {
      setShownCities(comparisonCitiesAvailable());
    });
    syncCitySuggestions();

    renderYearTotals();
    syncRateOptionVisibility();

    const map = L.map("map", { preferCanvas: true }).setView([34.0522, -118.2437], 10);
    state.map = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const geojson = await fetch(boundariesUrl).then((r) => {
      if (!r.ok) throw new Error(`boundaries HTTP ${r.status}`);
      return r.json();
    });

    function addBoundaryLayer(geojson, placeForFeature) {
      return L.geoJSON(geojson, {
        style: (feature) => districtPathStyle(placeForFeature(feature)),
        onEachFeature: (feature, featureLayer) => {
          const place = placeForFeature(feature);
          state.layersByDistrict.set(place, featureLayer);
          featureLayer.on("click", () => selectDistrict(place));
          featureLayer.bindTooltip(place);
        },
      });
    }

    const layer = addBoundaryLayer(geojson, (feature) =>
      districtLabel(feature.properties.District),
    ).addTo(map);
    state.allDistrictsLayer = layer;

    const cityGeojson = await fetch(cityBoundariesUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`city boundaries HTTP ${response.status}`);
      }
      return response.json();
    });
    state.cityPlaces = new Set(
      (cityGeojson.features || []).map((feature) => String(feature.properties.name)),
    );
    const cityLayer = addBoundaryLayer(cityGeojson, (feature) =>
      String(feature.properties.name),
    ).addTo(map);
    state.cityLayer = cityLayer;
    cityLayer.bringToFront();
    syncCitySuggestions();
    fitAllDistricts();
    await loadCornerPoints();
    if (state.pvzEnabled) {
      await loadPaintedCrosswalks();
    }
    if (state.hinEnabled) {
      await loadHinDocument();
    }
    if (state.safetyCorridorsEnabled) {
      await loadSafetyCorridorsDocument();
    }
    if (state.mobilityPlanEnabled) {
      await loadMobilityPlanDocument();
    }
    if (state.schoolsEnabled) {
      await loadSchoolRadiusDocument();
      await loadSchoolsDocument();
    }
    if (state.parksEnabled) {
      await loadParkRadiusDocument();
      await loadParksDocument();
    }

    async function showSchoolDistricts() {
      const geojson = await fetch(schoolBoundariesUrl).then((response) => {
        if (!response.ok) {
          throw new Error(`school boundaries HTTP ${response.status}`);
        }
        return response.json();
      });
      if (state.allDistrictsLayer) {
        map.removeLayer(state.allDistrictsLayer);
      }
      if (state.cityLayer) {
        map.removeLayer(state.cityLayer);
      }
      state.layersByDistrict.clear();
      const schoolLayer = addBoundaryLayer(geojson, (feature) =>
        String(feature.properties.LABEL),
      ).addTo(map);
      state.allDistrictsLayer = schoolLayer;
      state.view = "school district";
    }

    window.__cornersMap = {
      selectDistrict,
      setBicyclistDocument,
      bicyclistHasCityYears: () => Boolean(state.bicyclistDocument?.city_years),
      cityRowTotal: (place) => {
        const document = activeDocument();
        if (!document) {
          return 0;
        }
        return headingsToShow(document).reduce(
          (sum, heading) => sum + placeYearCount(document, place, heading),
          0,
        );
      },
      clickPlace: (place) => {
        const placeLayer = state.layersByDistrict.get(place);
        if (!placeLayer) {
          throw new Error(`missing place ${place}`);
        }
        placeLayer.fire("click");
      },
      clearSelection,
      setRateMode,
      setAgeGroup,
      setAgeGroups,
      getAgeGroup: () => (state.ageGroups.length === 1 ? state.ageGroups[0] : ""),
      getAgeGroups: () => [...state.ageGroups],
      measureForDistrict,
      fillBandForDistrict,
      districtPathStyle: (place) => {
        const districtLayer = state.layersByDistrict.get(place);
        if (!districtLayer) {
          return null;
        }
        return {
          fillColor: districtLayer.options.fillColor,
          fillOpacity: districtLayer.options.fillOpacity,
          color: districtLayer.options.color,
          weight: districtLayer.options.weight,
        };
      },
      fitAllDistricts,
      fitDistrict,
      getSelected: () => (state.places.length === 1 ? state.places[0] : null),
      getPlaces: () => [...state.places],
      getShownCities: () => [...state.shownCities],
      hasCornerPoints: () => state.cornerMarkers.size > 0,
      paintedCrosswalkCount: () => {
        if (!state.paintedLayer || !state.map?.hasLayer(state.paintedLayer)) {
          return 0;
        }
        let count = 0;
        for (const marker of state.paintedMarkers.values()) {
          if (state.paintedLayer.hasLayer(marker)) {
            count += 1;
          }
        }
        return count;
      },
      paintedCrosswalk: (name) => {
        const marker = state.paintedMarkers.get(name);
        if (!state.paintedLayer || !state.map?.hasLayer(state.paintedLayer)) {
          return null;
        }
        if (!marker || !state.paintedLayer.hasLayer(marker)) {
          return null;
        }
        return {
          shape: state.paintedShapes.get(name) || "",
          fill: marker.options.fillColor,
        };
      },
      hinReady: () => state.hinReady,
      hinSegmentCount: () => (state.hin2024 ? state.hinDrawn.size : 0),
      hinSegment: (name) => {
        if (!state.hin2024) {
          return null;
        }
        return state.hinDrawn.get(name) || null;
      },
      corridorsReady: () => state.corridorsReady,
      corridorSegmentCount: () => (state.safetyCorridors2024 ? state.corridorsDrawn.size : 0),
      corridorSegment: (name) => {
        if (!state.safetyCorridors2024) {
          return null;
        }
        return state.corridorsDrawn.get(name) || null;
      },
      mobilityPlanReady: () => state.mobilityPlanReady,
      mobilityPlanSegmentCount: () => (state.mobilityPlanOn ? state.mobilityPlanDrawn.size : 0),
      mobilityPlanSegment: (name) => {
        if (!state.mobilityPlanOn) {
          return null;
        }
        return state.mobilityPlanDrawn.get(name) || null;
      },
      mobilityPlanLegendVisible: () => Boolean(state.mobilityPlanLegend),
      mobilityPlanLegendPosition: () => {
        if (!state.mobilityPlanLegend || !state.map) {
          return null;
        }
        return state.mobilityPlanLegend.options.position;
      },
      mobilityPlanLegendEntries: () => {
        if (!state.mobilityPlanLegend) {
          return [];
        }
        const root = state.mobilityPlanLegend.getContainer();
        if (!root) {
          return [];
        }
        return [...root.querySelectorAll(".mobility-plan-legend-row")].map((row) => ({
          network: row.dataset.network,
          name: row.querySelector(".mobility-plan-legend-name")?.textContent || "",
          colorFamily: MOBILITY_PLAN_STYLES[row.dataset.network]?.colorFamily || "",
          isButton: row.tagName === "BUTTON" || row.querySelector("button") != null,
        }));
      },
      schoolRadiusDrawn: () =>
        Boolean(
          state.schools &&
            state.map &&
            ((state.schoolRadiusLayer && state.map.hasLayer(state.schoolRadiusLayer)) ||
              (state.listedSchoolRadiusLayer &&
                state.map.hasLayer(state.listedSchoolRadiusLayer))),
        ),
      schoolRadiusFixture: () => state.schoolRadiusDocument?.fixture || "",
      schoolRadiusVintage: () => state.schoolRadiusDocument?.boundary_vintage || "",
      schoolRadiusPlaces: () => [...state.places],
      selectedSchoolName: () => state.selectedSchoolName,
      selectedSchoolPin: () =>
        state.selectedSchoolName == null
          ? null
          : {
              name: state.selectedSchoolName,
              count: state.selectedSchoolCount,
              lat: state.selectedSchoolMarker?.getLatLng?.().lat,
              lng: state.selectedSchoolMarker?.getLatLng?.().lng,
            },
      selectedSchoolRadius: () => {
        if (!state.selectedSchoolName || !state.schoolsDocument) {
          return null;
        }
        const school = (state.schoolsDocument.schools || []).find(
          (row) => row.name === state.selectedSchoolName,
        );
        if (!school) {
          return null;
        }
        return {
          name: school.name,
          geometry: school.radius_geometry,
        };
      },
      selectedPlaces: () => [...state.places],
      applyPlaces,
      schoolRadiusWithinSelectedPlaces: () => {
        if (!state.schoolRadiusLayer || state.places.length === 0) {
          return false;
        }
        // near-schools-v1 Alpha (CD1) and Beta (CD3) centroids stay after the clip.
        const samples = [L.latLng(34.0444, -118.281), L.latLng(34.177, -118.5407)];
        return samples.every((point) => pointInSelectedPlaces(point));
      },
      parkRadiusDrawn: () =>
        Boolean(
          state.parks &&
            state.map &&
            ((state.parkRadiusLayer && state.map.hasLayer(state.parkRadiusLayer)) ||
              (state.listedParkRadiusLayer &&
                state.map.hasLayer(state.listedParkRadiusLayer))),
        ),
      listedParkRadiusNames: () => {
        if (
          !state.listedParkRadiusLayer ||
          !state.map ||
          !state.map.hasLayer(state.listedParkRadiusLayer)
        ) {
          return [];
        }
        const names = [];
        state.listedParkRadiusLayer.eachLayer((layer) => {
          const name = layer.feature?.properties?.name;
          if (name) {
            names.push(name);
          }
        });
        return names;
      },
      listedParkRadiusStyle: (name) => {
        if (
          !state.listedParkRadiusLayer ||
          !state.map ||
          !state.map.hasLayer(state.listedParkRadiusLayer)
        ) {
          return null;
        }
        let found = null;
        state.listedParkRadiusLayer.eachLayer((layer) => {
          if (layer.feature?.properties?.name !== name) {
            return;
          }
          found = {
            weight: layer.options.weight,
            opacity: layer.options.opacity,
            fillOpacity: layer.options.fillOpacity,
            fillColor: layer.options.fillColor,
          };
        });
        return found;
      },
      selectedParkName: () => state.selectedParkName,
      selectedParkPin: () =>
        state.selectedParkName == null
          ? null
          : {
              name: state.selectedParkName,
              count: state.selectedParkCount,
              lat: state.selectedParkMarker?.getLatLng?.().lat,
              lng: state.selectedParkMarker?.getLatLng?.().lng,
            },
      selectedParkRadius: () => {
        if (!state.selectedParkName || !state.parksDocument) {
          return null;
        }
        const park = (state.parksDocument.parks || []).find(
          (row) => row.name === state.selectedParkName,
        );
        if (!park) {
          return null;
        }
        return {
          name: park.name,
          geometry: park.radius_geometry,
        };
      },
      parkRadiusFixture: () => state.parkRadiusDocument?.fixture || "",
      parkRadiusVintage: () => state.parkRadiusDocument?.boundary_vintage || "",
      parkRadiusPlaces: () => [...state.places],
      parkRadiusLayerContains: (lat, lng) =>
        Boolean(
          state.parkRadiusLayer &&
            pointInLayer(L.latLng(Number(lat), Number(lng)), state.parkRadiusLayer),
        ),
      parkRadiusWithinSelectedPlaces: () => {
        if (!state.parkRadiusLayer || state.places.length === 0) {
          return false;
        }
        const vertices = [];
        const collect = (layer) => {
          if (typeof layer.eachLayer === "function" && typeof layer.getLatLngs !== "function") {
            layer.eachLayer(collect);
            return;
          }
          if (typeof layer.getLatLngs !== "function") {
            return;
          }
          for (const ring of ringsFromLatLngs(layer.getLatLngs())) {
            for (const point of ring) {
              if (point?.lat != null) {
                vertices.push(point);
              }
            }
          }
        };
        collect(state.parkRadiusLayer);
        // Clip vertices lie on the district boundary. A point on that edge counts.
        const onSelectedBoundary = (latlng) =>
          state.places.some((place) => {
            const district = state.layersByDistrict.get(place);
            if (!district) {
              return false;
            }
            let hit = false;
            const visit = (layer) => {
              if (hit) {
                return;
              }
              if (typeof layer.eachLayer === "function" && typeof layer.getLatLngs !== "function") {
                layer.eachLayer(visit);
                return;
              }
              if (typeof layer.getLatLngs !== "function") {
                return;
              }
              for (const ring of ringsFromLatLngs(layer.getLatLngs())) {
                if (pointNearRing(latlng.lat, latlng.lng, ring)) {
                  hit = true;
                  return;
                }
              }
            };
            visit(district);
            return hit;
          });
        return (
          vertices.length > 0 &&
          vertices.every((point) => pointInSelectedPlaces(point) || onSelectedBoundary(point))
        );
      },
      showSchoolDistricts,
      view: () => state.view,
      isCornerVisible: (name) => {
        for (const [key, marker] of state.cornerMarkers) {
          const point = state.cornerPointsByName.get(key);
          if (!point || point.corner !== name) {
            continue;
          }
          if (!modesToShow().includes(state.cornerModeByName.get(key))) {
            continue;
          }
          if (state.cornerLayer && state.cornerLayer.hasLayer(marker)) {
            return true;
          }
        }
        return false;
      },
      visibleIncidentCount: () => {
        let total = 0;
        for (const [key, marker] of state.cornerMarkers) {
          if (!state.cornerLayer?.hasLayer(marker)) {
            continue;
          }
          total += displayedCornerCount(state.cornerPointsByName.get(key));
        }
        return total;
      },
      cornerFill: (name) => {
        for (const [key, marker] of state.cornerMarkers) {
          const point = state.cornerPointsByName.get(key);
          if (!point || point.corner !== name) {
            continue;
          }
          if (!modesToShow().includes(state.cornerModeByName.get(key))) {
            continue;
          }
          if (!state.cornerLayer?.hasLayer(marker)) {
            continue;
          }
          return marker.options.fillColor;
        }
        return null;
      },
      openCornerPopup: (name) => {
        for (const [key, marker] of state.cornerMarkers) {
          const point = state.cornerPointsByName.get(key);
          if (!point || point.corner !== name) {
            continue;
          }
          if (!modesToShow().includes(state.cornerModeByName.get(key))) {
            continue;
          }
          if (!state.cornerLayer?.hasLayer(marker)) {
            continue;
          }
          marker.openPopup();
          return;
        }
        throw new Error(`corner ${name} is not visible`);
      },
      mapFitsAllDistricts: () => {
        const view = map.getBounds();
        const target = layer.getBounds();
        return view.contains(target.getSouthWest()) && view.contains(target.getNorthEast());
      },
      mapFitsStreetPoints: (street) => {
        const latlngs = streetPointLatLngs(street);
        if (!state.map || latlngs.length === 0) {
          return false;
        }
        const bounds = L.latLngBounds(latlngs);
        if (!state.map.getBounds().contains(bounds)) {
          return false;
        }
        const fittedZoom = state.map.getBoundsZoom(bounds, false, FIT_PADDING);
        return state.map.getZoom() === fittedZoom;
      },
      mapFitsDistrict: (place) => {
        const districtLayer = state.layersByDistrict.get(place);
        if (!districtLayer) {
          return false;
        }
        const view = map.getBounds();
        const target = districtLayer.getBounds();
        return view.contains(target.getSouthWest()) && view.contains(target.getNorthEast());
      },
      setStreetIndex: (index) => {
        state.streetIndex = index;
        fillStreetSuggestions();
      },
      document,
    };
  }

  main().catch((err) => {
    documentElement("sidebar-table").textContent = `Failed to load map: ${err.message}`;
    console.error(err);
  });
})();
