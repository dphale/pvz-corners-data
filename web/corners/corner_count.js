/**
 * Incident count drawn for one corner circle under the current filters.
 * Age-group maps are omitted when every count is zero, so a missing map
 * keeps the all-ages total used by the invented corner fixtures.
 */
(function (root) {
  function ageFilterActive(ageGroups) {
    return Array.isArray(ageGroups) && ageGroups.length > 0;
  }

  function sumAgeYearMaps(ageYears, ageGroups) {
    if (!ageYears || !ageFilterActive(ageGroups)) {
      return {};
    }
    const combined = {};
    for (const label of ageGroups) {
      for (const [heading, amount] of Object.entries(ageYears[label] || {})) {
        combined[heading] = (combined[heading] || 0) + (Number(amount) || 0);
      }
    }
    return combined;
  }

  function sumYearMap(yearMap, years) {
    let total = 0;
    if (years && years.length) {
      for (const heading of years) {
        total += Number(yearMap?.[heading]) || 0;
      }
      return total;
    }
    for (const amount of Object.values(yearMap || {})) {
      total += Number(amount) || 0;
    }
    return total;
  }

  function displayedCornerCount(point, filters = {}) {
    if (!point) {
      return 0;
    }
    const ageGroups = filters.ageGroups || [];
    const years = filters.years || [];
    const severity = filters.severity || "";
    const ageOn = ageFilterActive(ageGroups);

    if (years.length) {
      if (severity === "killed") {
        if (ageOn && point.killed_age_years) {
          return sumYearMap(sumAgeYearMaps(point.killed_age_years, ageGroups), years);
        }
        return sumYearMap(point.killed_years, years);
      }
      if (severity === "serious") {
        if (ageOn && point.serious_age_years) {
          return sumYearMap(sumAgeYearMaps(point.serious_age_years, ageGroups), years);
        }
        return sumYearMap(point.serious_years, years);
      }
      if (ageOn && point.age_years) {
        return sumYearMap(sumAgeYearMaps(point.age_years, ageGroups), years);
      }
      return sumYearMap(point.year_counts, years);
    }
    if (severity === "killed") {
      if (ageOn && point.killed_age_years) {
        return sumYearMap(sumAgeYearMaps(point.killed_age_years, ageGroups));
      }
      return Number(point.killed) || 0;
    }
    if (severity === "serious") {
      if (ageOn && point.serious_age_years) {
        return sumYearMap(sumAgeYearMaps(point.serious_age_years, ageGroups));
      }
      return Number(point.serious) || 0;
    }
    if (ageOn && point.groups) {
      let total = 0;
      for (const label of ageGroups) {
        total += Number(point.groups[label]) || 0;
      }
      return total;
    }
    return Number(point.count) || 0;
  }

  const api = { displayedCornerCount };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornerCount = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
