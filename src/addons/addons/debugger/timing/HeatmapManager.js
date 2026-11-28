function valueToHeatmapColor(value, min = 0, max = 1) {
  const clampedValue = Math.max(min, Math.min(max, value));
  const normalizedValue = max <= min ? 1 : (clampedValue - min) / (max - min);
  const r = Math.round(255 * normalizedValue);
  const b = Math.round(255 * (1 - normalizedValue));
  return `#${((1 << 24) | (r << 16) | b).toString(16).slice(1).toUpperCase()}`;
}

function recursiveFillBlock(block, fill = null) {
  const fillColor = fill === null ? block.colour_ : fill;
  block.svgPath_.style.fill = fillColor;

  // Set text color for blocks with heatmap applied
  const textElements = block.svgGroup_.querySelectorAll(
    ":scope > :not(.blocklyDraggable):not([data-shapes='stack']) > text, :scope > text"
  );

  if (fill !== null) {
    // Heatmap is being applied - force white text
    textElements.forEach((textEl) => {
      textEl.style.setProperty("fill", "white", "important");
    });
  } else {
    // Heatmap is being removed - remove our inline styles
    textElements.forEach((textEl) => {
      textEl.style.removeProperty("fill");
    });
  }

  if (block.childBlocks_) {
    block.childBlocks_.forEach((child) => {
      if (child.previousConnection === null) {
        recursiveFillBlock(child, fill);
      }
    });
  }

  block.inputList.forEach((input) => {
    input.fieldRow.forEach((field) => {
      if (field.box_) field.box_.style.fill = fill;
    });
  });
}

class HeatmapManager {
  constructor(getWorkspace, tableRows, config, vm) {
    this.getWorkspace = getWorkspace;
    this.tableRows = tableRows;
    this.config = config;
    this.vm = vm;
    this.coloredBlocks = new Set(); // Track all blocks that have been colored
    this.modifiedTimers = new Set(); // Track timers that have been modified since last heatmap update
    this.realtimeUpdateInterval = null;
    this.lastHeatmapTime = 0;
    this.currentHeatmapMax = 1.0; // Store current heatmap max for real-time updates
  }

  showHeatmapFn(heatmapMax) {
    this.currentHeatmapMax = heatmapMax; // Store the current heatmap max
    this.updateAllTimers(heatmapMax);
    this.lastHeatmapTime = performance.now();
    this.modifiedTimers.clear();
    this.startRealtimeUpdates(heatmapMax);
  }

  hideHeatmapFn() {
    // Stop real-time updates
    this.stopRealtimeUpdates();

    // Reset all previously colored blocks, not just current timer blocks
    const workspace = this.getWorkspace();
    this.coloredBlocks.forEach((blockId) => {
      const block = workspace.blockDB_[blockId];
      if (block) {
        recursiveFillBlock(block);
      }
    });
    // Also reset any current timer blocks
    this.updateBlocks((block) => recursiveFillBlock(block));

    this.modifiedTimers.clear();
  }

  updateBlocks(fillFn) {
    const workspace = this.getWorkspace();
    this.tableRows.rows
      .filter((timer) => timer.blockId)
      .forEach((timer) => {
        const block = workspace.blockDB_[timer.blockId];
        if (block) fillFn(block, timer);
      });
  }

  // Check if the project is currently running by looking at active threads
  isProjectRunning() {
    return (
      this.vm?.runtime?.threads.some(
        (thread) => !thread.updateMonitor && [0, 2, 3].includes(thread.status) // STATUS_RUNNING, STATUS_YIELD, STATUS_YIELD_TICK
      ) || false
    );
  }

  // Mark a timer as modified for real-time updates
  markTimerModified(blockId) {
    this.modifiedTimers.add(blockId);
  }

  // Start real-time heatmap updates when project is running
  startRealtimeUpdates(heatmapMax) {
    this.stopRealtimeUpdates(); // Clear any existing interval
    this.realtimeUpdateInterval = setInterval(() => {
      if (this.config.showHeatmap && this.modifiedTimers.size > 0) {
        this.updateHeatmapColors(this.currentHeatmapMax, true); // true = only modified timers
      }
    }, 100); // Update every 100ms
  }

  // Stop real-time updates
  stopRealtimeUpdates() {
    clearInterval(this.realtimeUpdateInterval);
    this.realtimeUpdateInterval = null;
  }

  // Update all timers (full heatmap refresh)
  updateAllTimers(heatmapMax) {
    this.updateHeatmapColors(heatmapMax, false);
  }

  // Consolidated method to update heatmap colors
  updateHeatmapColors(heatmapMax, onlyModified = false) {
    // Early return if heatmap is disabled
    if (!this.config.showHeatmap) return;

    // Show profiler data if there is any, otherwise timers
    const showProfile = this.tableRows.hasProfileRows();
    // The same block can have rows from both profilers
    const blockTimes = new Map();
    for (const timer of this.tableRows.rows) {
      if (!!timer.isProfile !== showProfile || !timer.blockId) continue;
      blockTimes.set(timer.blockId, (blockTimes.get(timer.blockId) || 0) + timer.totalTime);
    }

    let totalTime = 0;
    for (const time of blockTimes.values()) totalTime += time;
    if (totalTime === 0) return;

    const percentTimes = [...blockTimes.values()].map((time) => time / totalTime);
    const min = Math.min(...percentTimes);
    const max = Math.max(...percentTimes) * heatmapMax;

    const workspace = this.getWorkspace();

    for (const [blockId, time] of blockTimes) {
      if (onlyModified && !this.modifiedTimers.has(blockId)) continue;
      const block = workspace.blockDB_[blockId];
      if (block) {
        recursiveFillBlock(block, valueToHeatmapColor(time / totalTime, min, max));
        this.coloredBlocks.add(blockId);
      }
    }

    if (onlyModified) {
      this.modifiedTimers.clear();
    }
  }
}

export default HeatmapManager;
