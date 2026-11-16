/**
 * Ranked park-list helpers for the Corners Map sidebar.
 * Sort is count descending, then park name ascending. The sidebar shows
 * at most TOP_LIMIT rows. Publish and park_radius_slice keep the full catalog.
 */
(function (root) {
  const TOP_LIMIT = 10;

  function sortParkRows(rows) {
    return [...(rows || [])].sort(
      (a, b) => Number(b.count) - Number(a.count) || String(a.name).localeCompare(String(b.name)),
    );
  }

  function topParks(rows, limit = TOP_LIMIT) {
    return sortParkRows(rows).slice(0, limit);
  }

  function sumParkRows(rowLists) {
    const totals = new Map();
    const districts = new Map();
    for (const rows of rowLists) {
      for (const row of rows || []) {
        totals.set(row.name, (totals.get(row.name) || 0) + Number(row.count || 0));
        if (row.district) {
          districts.set(row.name, row.district);
        }
      }
    }
    return [...totals.entries()].map(([name, count]) => {
      const row = { name, count };
      if (districts.has(name)) {
        row.district = districts.get(name);
      }
      return row;
    });
  }

  function formatDistrictLabel(district) {
    const match = /^Council District (\d+)$/.exec(String(district || ""));
    if (match) {
      return `CD ${match[1]}`;
    }
    return String(district || "");
  }

  function formatParkName(row) {
    if (row && row.district) {
      return `${row.name} (${formatDistrictLabel(row.district)})`;
    }
    return row?.name || "";
  }

  const api = {
    TOP_LIMIT,
    sortParkRows,
    topParks,
    sumParkRows,
    formatDistrictLabel,
    formatParkName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornersParkList = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
