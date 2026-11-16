/**
 * Council-district select and deselect for the Corners Map place table.
 * Select all appends missing "Council District N" names in roster order.
 * Deselect all removes only those names.
 */
(function (root) {
  function isCouncilDistrict(place) {
    return /^Council District \d+$/.test(place);
  }

  function councilDistrictNames(names) {
    return (names || []).filter(isCouncilDistrict);
  }

  function selectAllDistricts(places, districtNames) {
    const next = [...(places || [])];
    const have = new Set(next);
    for (const name of councilDistrictNames(districtNames)) {
      if (!have.has(name)) {
        next.push(name);
        have.add(name);
      }
    }
    return next;
  }

  function deselectAllDistricts(places) {
    return (places || []).filter((place) => !isCouncilDistrict(place));
  }

  function allCouncilDistrictsSelected(places, districtNames) {
    const selected = new Set(places || []);
    const districts = councilDistrictNames(districtNames);
    return districts.length > 0 && districts.every((name) => selected.has(name));
  }

  function anyCouncilDistrictSelected(places) {
    return (places || []).some(isCouncilDistrict);
  }

  function selectAllDisabled(places, districtNames) {
    return allCouncilDistrictsSelected(places, districtNames);
  }

  function unselectAllDisabled(places) {
    return !anyCouncilDistrictSelected(places);
  }

  const api = {
    isCouncilDistrict,
    selectAllDistricts,
    deselectAllDistricts,
    allCouncilDistrictsSelected,
    anyCouncilDistrictSelected,
    selectAllDisabled,
    unselectAllDisabled,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornersPlaceSelection = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
