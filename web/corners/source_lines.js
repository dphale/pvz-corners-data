/**
 * Which Sources lines follow a map-document layer flag.
 * A gated line is hidden when its flag is off or missing.
 * TIMS, the council map, census, and boundaries are not gated.
 */
(function (root) {
  const SOURCE_FLAG_KEYS = {
    "PVZ Crosswalks": "pvz_enabled",
    Schools: "schools_enabled",
    Parks: "parks_enabled",
    "HIN (2024)": "hin_enabled",
    "Safety Corridors (2024)": "safety_corridors_enabled",
    "Mobility Plan 2035": "mobility_plan_enabled",
  };

  function sourceLineHidden(mapDocument, label) {
    const key = SOURCE_FLAG_KEYS[label];
    if (!key) {
      return false;
    }
    return !Boolean(mapDocument?.[key]);
  }

  const api = {
    SOURCE_FLAG_KEYS,
    sourceLineHidden,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornersSourceLines = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
