/**
 * Ranked school-list helpers for the Corners Map sidebar.
 * Sort is count descending, then school name ascending. The sidebar shows
 * at most TOP_LIMIT rows; publish and MCP keep the full catalog.
 */
(function (root) {
  const TOP_LIMIT = 10;

  function sortSchoolRows(rows) {
    return [...(rows || [])].sort(
      (a, b) => Number(b.count) - Number(a.count) || String(a.name).localeCompare(String(b.name)),
    );
  }

  function topSchools(rows, limit = TOP_LIMIT) {
    return sortSchoolRows(rows).slice(0, limit);
  }

  function sumSchoolRows(rowLists) {
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

  function formatSchoolName(row) {
    if (row && row.district) {
      return `${row.name} (${formatDistrictLabel(row.district)})`;
    }
    return row?.name || "";
  }

  const api = {
    TOP_LIMIT,
    sortSchoolRows,
    topSchools,
    sumSchoolRows,
    formatDistrictLabel,
    formatSchoolName,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.CornersSchoolList = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
