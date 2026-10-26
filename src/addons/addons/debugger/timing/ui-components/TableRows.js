import LogView from "../../log-view.js"; // Assuming LogView is imported from elsewhere

function createInfoElement(text) {
  const elem = document.createElement("span");
  elem.textContent = text;
  return elem;
}

class TableRows extends LogView {
  constructor(config, debug, msg, tableHeader) {
    super();
    this.config = config;
    this.totalTime = null;
    this.minTimerTime = null;
    this.debug = debug;
    this.tableHeader = tableHeader;
    // Row objects are reused between updates so that LogView doesn't regenerate their elements
    this.rowCache = new Map();

    this.placeholderElement.textContent = msg("timing-no-timers");
  }

  getRowLabel(timer) {
    let displayLabel = timer.displayLabel !== undefined ? timer.displayLabel : timer.label;
    // Ensure empty labels have height by using a non-breaking space
    if (displayLabel === "") {
      displayLabel = "\u00A0"; // non-breaking space
    }

    // For profiler rows, use the human-readable block text
    if (timer.isProfile && timer.targetId !== null && timer.blockId !== null) {
      const preview = this.debug.createBlockPreview(timer.targetId, timer.blockId);
      if (preview !== null) {
        displayLabel = `${timer.idx}: ${preview.textContent}`;
      }
    }

    return displayLabel;
  }

  getRowNumbers(timer) {
    return {
      totalTime: timer.totalTime.toFixed(1),
      avgTime: timer.callCount === 0 ? "" : (timer.totalTime / timer.callCount).toFixed(2),
      // Profiler rows and timer rows are each compared against their own kind
      percent: this.config.showRatioTime
        ? (timer.totalTime / (timer.isProfile ? this.minProfileTime : this.minTimerTime)).toFixed(1)
        : this.getPercent(timer.totalTime, timer.isProfile ? this.totalProfileTime : this.totalTimerTime),
      callCount: timer.callCount === 0 ? "" : timer.callCount,
    };
  }

  getRowValues(timer) {
    return { label: this.getRowLabel(timer), ...this.getRowNumbers(timer) };
  }

  generateRow(timer) {
    const root = document.createElement("div");
    root.className = "sa-timing-timer";

    let labelElem = null;
    if (timer.targetId !== null && timer.blockId !== null) {
      const preview = this.debug.createBlockPreview(timer.targetId, timer.blockId);
      labelElem = this.debug.createBlockLink(this.debug.getTargetInfoById(timer.targetId), timer.blockId);
      if (preview !== null) {
        labelElem.className = preview.className;
        labelElem.textContent = `${timer.idx}: ${preview.textContent}`;
        labelElem.setAttribute("data-shape", preview.getAttribute("data-shape"));
      }
      if (!timer.isProfile) {
        labelElem.textContent = this.getRowLabel(timer);
      }
    } else {
      labelElem = createInfoElement(this.getRowLabel(timer));
      labelElem.classList.add("sa-timing-plain-label");
      if (timer.helpText) {
        labelElem.classList.add("sa-timing-help-label");
        labelElem.title = timer.helpText;
      }
    }

    const totalTime = createInfoElement("");
    const avgTime = createInfoElement("");
    const percent = createInfoElement("");
    const callCount = createInfoElement("");
    root.append(labelElem, totalTime, avgTime, percent, callCount);
    return { root, totalTime, avgTime, percent, callCount };
  }

  renderRow(elements, timer) {
    const { totalTime, avgTime, percent, callCount } = timer.numbers;
    const perSymbol = this.config.showRatioTime ? "" : "%";
    elements.totalTime.textContent = `${totalTime} ms`;
    elements.avgTime.textContent = avgTime === "" ? "" : `${avgTime} ms`;
    elements.percent.textContent = `${percent} ${perSymbol}`;
    elements.callCount.textContent = callCount;
  }

  getPercent(time, total) {
    return total === 0 ? "100.00" : ((100 * time) / total).toFixed(2);
  }

  getMinTime(isProfile) {
    const times = this.rows.filter((row) => !!row.isProfile === isProfile).map((row) => row.totalTime);
    const min = Math.min(...times);
    return min === 0 || min === Infinity ? 0.1 : min;
  }

  updateLogRows(timers) {
    const newCache = new Map();
    this.rows = Object.entries(timers).map(([label, value]) => {
      const row = Object.assign(this.rowCache.get(label) || {}, value, { label });
      newCache.set(label, row);
      return row;
    });
    this.rowCache = newCache;
    this.tableHeader.style.display = this.rows.length === 0 ? "none" : "flex";
    if (this.sortHeader !== "null") this.sortRows();
    this.totalProfileTime = this.getTotalTime(true);
    this.totalTimerTime = this.getTotalTime(false);
    this.minProfileTime = this.getMinTime(true);
    this.minTimerTime = this.getMinTime(false);
    // Stored on the row so that LogView notices when they change and calls renderRow
    for (const row of this.rows) {
      row.numbers = this.getRowNumbers(row);
      row.showRatioTime = this.config.showRatioTime;
    }
    this.queueUpdateContent();
  }

  hasProfileRows() {
    return this.rows.some((row) => row.isProfile);
  }

  sortRows() {
    const { sortDirection, sortHeader } = this.config;
    for (const row of this.rows) {
      row.avgTime = row.callCount === 0 ? 0 : row.totalTime / row.callCount;
    }
    this.rows.sort((a, b) => (sortDirection === "ascending" ? 1 : -1) * (a[sortHeader] - b[sortHeader]));
  }

  getTotalTime(isProfile) {
    return this.rows.reduce((total, row) => (!!row.isProfile === isProfile ? total + row.totalTime : total), 0);
  }
}

export default TableRows;
