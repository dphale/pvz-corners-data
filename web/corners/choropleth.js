/**
 * Council-district choropleth bands for the Corners Map.
 * Empty fill is only for measure 0. Unassigned is not a polygon and is
 * excluded from the peak used to scale district fills.
 */
(function (root) {
  const UNASSIGNED = "Unassigned";
  const EMPTY_FILL = "#f5f5f5";
  const LOW_FILL = "#fcbba1";
  const MID_FILL = "#fb6a4a";
  const HIGH_FILL = "#a50f15";

  function peakFromTotals(totals) {
    let peak = 0;
    for (const [place, value] of Object.entries(totals || {})) {
      if (place === UNASSIGNED) {
        continue;
      }
      const n = Number(value) || 0;
      if (n > peak) {
        peak = n;
      }
    }
    return peak;
  }

  function fillBand(total, peak) {
    if (total <= 0 || peak <= 0) {
      return "empty";
    }
    const t = total / peak;
    if (t > 0.66) return "high";
    if (t > 0.33) return "mid";
    return "low";
  }

  function fillColor(total, peak) {
    const band = fillBand(total, peak);
    if (band === "empty") return EMPTY_FILL;
    if (band === "high") return HIGH_FILL;
    if (band === "mid") return MID_FILL;
    return LOW_FILL;
  }

  const api = {
    UNASSIGNED,
    EMPTY_FILL,
    LOW_FILL,
    MID_FILL,
    HIGH_FILL,
    peakFromTotals,
    fillBand,
    fillColor,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornersChoropleth = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
