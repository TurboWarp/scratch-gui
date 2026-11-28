import TimingManager from "./TimingManager.js";
import HeatmapManager from "./HeatmapManager.js";
import SamplingProfiler from "./SamplingProfiler.js";
import InterpreterProfiler from "./InterpreterProfiler.js";
import { createTableHeader } from "./ui-components/tableHeader.js";
import TableRows from "./ui-components/TableRows.js"; // Importing the extended LogView class
import { updateAllBlocksEvents } from "../../../libraries/common/cs/update-all-blocks.js";
import downloadBlob from "../../../libraries/common/cs/download-blob.js";
import { isPaused, onPauseChanged, onSingleStep, getRunningThread } from "../module.js";

export default async function createTimingTab({ debug, addon, console, msg }) {
  const vm = addon.tab.traps.vm;
  const profilingRestartNotice = Object.assign(document.createElement("div"), {
    className: "sa-timing-restart-notice",
    hidden: true,
  });
  const restartProjectLink = Object.assign(document.createElement("a"), {
    textContent: "Restart the project",
  });
  restartProjectLink.addEventListener("click", () => {
    vm.stopAll();
    vm.greenFlag();
  });
  // The notice is a flex container, which would collapse a normal leading space
  profilingRestartNotice.append(restartProjectLink, "\u00A0to begin profiling.");
  const profilingUnsupportedNotice = Object.assign(document.createElement("div"), {
    className: "sa-timing-restart-notice sa-timing-unsupported-notice",
    hidden: true,
  });
  const disableCompilerLink = Object.assign(document.createElement("a"), {
    textContent: msg("timing-disable-compiler"),
  });
  disableCompilerLink.addEventListener("click", () => {
    vm.setCompilerOptions({ enabled: false });
  });
  profilingUnsupportedNotice.append(
    `${msg("timing-profiling-unsupported")} ${msg("timing-profiling-unsupported-details")} `,
    disableCompilerLink
  );

  function createContent() {
    const content = Object.assign(document.createElement("div"), {
      className: "sa-timing-content",
    });
    content.appendChild(profilingRestartNotice);
    content.appendChild(profilingUnsupportedNotice);
    content.appendChild(tableHeader);
    content.appendChild(tableRows.outerElement);

    return content;
  }

  function createLineByLineButton() {
    const lineByLineButton = debug.createIconButton({
      text: msg("timing-profiling"),
    });

    // Add checkbox to the left side of the button
    const checkbox = Object.assign(document.createElement("input"), {
      type: "checkbox",
      className: "sa-timing-checkbox",
    });

    // Add specific class
    lineByLineButton.element.classList.add("sa-timing-profiling-toggle");

    // Prepend checkbox to button (left side)
    lineByLineButton.element.insertBefore(checkbox, lineByLineButton.element.firstChild);

    // Make entire button clickable to toggle checkbox
    lineByLineButton.element.addEventListener("click", (e) => {
      if (lineByLineButton.element.disabled) return;
      // Don't double-toggle if clicking directly on checkbox
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      }
    });

    // Handle checkbox change
    checkbox.addEventListener("change", () => {
      if (lineByLineButton.element.disabled) checkbox.checked = false;
      setProfiling(checkbox.checked);
    });

    lineByLineButton.checkbox = checkbox;
    return lineByLineButton;
  }

  function createHeatmapButton() {
    const heatmapButton = debug.createIconButton({
      text: msg("timing-heatmap"),
    });

    // Add checkbox to the left side of the button
    const checkbox = Object.assign(document.createElement("input"), {
      type: "checkbox",
      className: "sa-timing-checkbox",
    });

    // Create slider container (initially hidden)
    const sliderContainer = Object.assign(document.createElement("div"), {
      className: "sa-timing-heatmap-slider-container",
    });

    // Create slider track
    const sliderTrack = Object.assign(document.createElement("div"), {
      className: "sa-timing-heatmap-slider-track",
    });

    // Create slider thumb
    const sliderThumb = Object.assign(document.createElement("div"), {
      className: "sa-timing-heatmap-slider-thumb",
    });

    sliderTrack.appendChild(sliderThumb);
    sliderContainer.appendChild(sliderTrack);

    // Create a wrapper for the original button content (checkbox + icon + text)
    const buttonContentWrapper = Object.assign(document.createElement("div"), {
      className: "sa-timing-heatmap-content-wrapper",
    });

    // Move existing content into the wrapper
    const existingContent = Array.from(heatmapButton.element.children);
    existingContent.forEach((child) => buttonContentWrapper.appendChild(child));

    // Add specific class to disable hover effect
    heatmapButton.element.classList.add("sa-timing-heatmap-toggle");

    // Prepend checkbox to wrapper (left side)
    buttonContentWrapper.insertBefore(checkbox, buttonContentWrapper.firstChild);
    heatmapButton.element.appendChild(buttonContentWrapper);
    heatmapButton.element.appendChild(sliderContainer);

    // Slider state
    let isDragging = false;
    let hasInteractedWithSlider = false;

    // Update slider position based on value
    const updateSliderPosition = (value) => {
      const percentage = value * 100;
      sliderThumb.style.left = `${percentage}%`;
    };

    // Initialize slider position
    updateSliderPosition(config.currentHeatmapMax);

    // Slider interaction handlers
    const handleSliderInteraction = (e) => {
      e.stopPropagation(); // Prevent checkbox toggle
      const rect = sliderTrack.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      config.currentHeatmapMax = x / rect.width;
      updateSliderPosition(config.currentHeatmapMax);

      if (config.showHeatmap) {
        heatmapManager.showHeatmapFn(config.currentHeatmapMax);
      }
    };

    const handleMouseMove = (e) => {
      if (isDragging) {
        handleSliderInteraction(e);
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Set a flag to prevent button toggle for a short time after dragging
      hasInteractedWithSlider = true;
      setTimeout(() => {
        hasInteractedWithSlider = false;
      }, 50); // 50ms delay to prevent accidental toggles
    };

    sliderTrack.addEventListener("mousedown", (e) => {
      isDragging = true;
      handleSliderInteraction(e);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    });

    // Make entire button clickable to toggle checkbox (except slider area)
    heatmapButton.element.addEventListener("click", (e) => {
      if (heatmapButton.element.disabled) return;
      // Don't toggle if clicking on checkbox, slider, or recently interacted with slider
      if (e.target !== checkbox && !sliderContainer.contains(e.target) && !hasInteractedWithSlider) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      }
    });

    // Handle checkbox change
    checkbox.addEventListener("change", () => {
      if (heatmapButton.element.disabled) checkbox.checked = false;
      config.showHeatmap = checkbox.checked;
      sliderContainer.style.display = checkbox.checked ? "block" : "none";

      if (config.showHeatmap) {
        heatmapManager.showHeatmapFn(config.currentHeatmapMax);
      } else {
        heatmapManager.hideHeatmapFn();
      }
    });

    // Initially hide slider
    sliderContainer.style.display = "none";

    heatmapButton.checkbox = checkbox;
    return heatmapButton;
  }

  function createExportButton() {
    const exportButton = debug.createIconButton({
      text: msg("export"),
      icon: addon.self.getResource("/icons/download-white.svg") /* rewritten by pull.js */,
    });

    exportButton.element.addEventListener("click", () => {
      if (tableRows.rows.length === 0) return;

      const columns = ["label", "totalTime", "avgTime", "percent", "callCount"];
      const headerNames = {
        label: "Label",
        totalTime: "Total Time (ms)",
        avgTime: "Avg Time (ms)",
        percent: config.showRatioTime ? "Ratio Time" : "Percent Time",
        callCount: "Call Count",
      };

      // Create CSV headers
      const headers = columns.map((column) => headerNames[column]);

      // Create CSV rows
      const rows = tableRows.rows.map((row) => {
        const rowValues = tableRows.getRowValues(row);
        const values = columns.map((column) => rowValues[column]);
        // Convert non-breaking space back to empty string for CSV export
        if (values[0] === "\u00A0") {
          values[0] = "";
        }
        // Escape any commas in the label by wrapping in quotes
        values[0] = values[0].includes(",") ? `"${values[0]}"` : values[0];
        return values.join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      const filename = `timing_${tableRows.rows[0].label}.csv`;
      downloadBlob(filename, new Blob([csvContent], { type: "text/plain" }));
    });

    return exportButton;
  }

  function createClearButton() {
    const clearButton = debug.createIconButton({
      text: msg("clear"),
      icon: addon.self.getResource("/icons/delete.svg") /* rewritten by pull.js */,
    });

    clearButton.element.addEventListener("click", () => {
      timingManager.clearTimers();
      updateTable();
      heatmapManager.modifiedTimers.clear();

      if (config.showHeatmap) {
        heatmapManager.hideHeatmapFn();
        setTimeout(() => config.showHeatmap && heatmapManager.startRealtimeUpdates(config.currentHeatmapMax), 10);
      }
    });

    return clearButton;
  }

  function updatePercentageHeader() {
    const value = addon.settings.get("show_ratio_time");
    config.showRatioTime = value;
    percentHeader.textContent = value ? msg("timing-ratio-time") : msg("timing-percent-time");
  }

  // config for our block scope settings that can be modified in the toolbar
  const config = {
    isProfiling: false,
    showHeatmap: false,
    showRatioTime: false,
    sortHeader: "totalTime",
    sortDirection: "descending",
    currentHeatmapMax: 1.0, // Store heatmap max value for reapply operations
  };
  const { tableHeader, percentHeader } = createTableHeader(config, msg);
  const tableRows = new TableRows(config, debug, msg, tableHeader);

  const samplingProfiler = new SamplingProfiler(vm, msg);
  const interpreterProfiler = new InterpreterProfiler(vm);
  const timingManager = new TimingManager(addon.settings, config);
  const heatmapManager = new HeatmapManager(
    () => addon.tab.traps.getWorkspace(),
    tableRows,
    config,
    vm
  );
  samplingProfiler.tm = timingManager;
  interpreterProfiler.tm = timingManager;
  timingManager.heatmapManager = heatmapManager; // Connect them for real-time updates

  const content = createContent();
  const exportButton = createExportButton();
  const clearButton = createClearButton();
  const lineByLineButton = createLineByLineButton();
  const heatmapButton = createHeatmapButton();

  function updateTable() {
    tableRows.updateLogRows(timingManager.getTimers());
  }

  // setup events
  let lastTableUpdate = 0;
  debug.addAfterStepCallback(() => {
    const now = performance.now();
    if (now - lastTableUpdate < 100) return;
    lastTableUpdate = now;
    updateTable();
  });

  // Compiled scripts can only be profiled by the sampler, which needs SharedArrayBuffer.
  // Interpreted scripts are profiled by hooking the interpreter.
  const getProfiler = () => {
    if (!vm.runtime.compilerOptions.enabled) return interpreterProfiler;
    return samplingProfiler.isAvailable() ? samplingProfiler : null;
  };

  let activeProfiler = null;
  const startProfiling = () => {
    activeProfiler = getProfiler();
    if (activeProfiler) activeProfiler.start();
    // Scripts that were already compiled before profiling started aren't instrumented.
    profilingRestartNotice.hidden =
      activeProfiler !== samplingProfiler || !vm.runtime.threads.some((thread) => thread.isCompiled);
  };
  const stopProfiling = () => {
    if (activeProfiler) activeProfiler.stop();
    activeProfiler = null;
    profilingRestartNotice.hidden = true;
  };
  function setProfiling(enabled) {
    lineByLineButton.checkbox.checked = enabled;
    config.isProfiling = enabled;
    if (enabled) {
      startProfiling();
    } else {
      stopProfiling();
    }
  }

  // Handle single-step state changes
  let isSingleStepping = false;
  let restoreProfilingOnResume = false;
  const updateTimingAvailability = () => {
    const profiler = getProfiler();
    profilingUnsupportedNotice.hidden = profiler !== null;
    // The interpreter profiler's hooks conflict with single stepping
    const available = profiler !== null && !(isSingleStepping && profiler === interpreterProfiler);
    if (!available && config.isProfiling) setProfiling(false);
    lineByLineButton.element.disabled = !available;
    lineByLineButton.checkbox.disabled = !available;
    lineByLineButton.element.classList.toggle("sa-timing-disabled", !available);
  };

  const handleSingleStepChange = (paused) => {
    isSingleStepping = Boolean(paused && getRunningThread());
    if (isSingleStepping && activeProfiler === interpreterProfiler) {
      restoreProfilingOnResume = true;
      setProfiling(false);
    } else if (!isSingleStepping && restoreProfilingOnResume) {
      restoreProfilingOnResume = false;
      setProfiling(true);
    }
    updateTimingAvailability();
  };

  handleSingleStepChange(isPaused());
  onPauseChanged(handleSingleStepChange);
  onSingleStep(() => handleSingleStepChange(isPaused()));
  vm.on("COMPILER_OPTIONS_CHANGED", () => {
    // Switch profilers when the compiler is toggled
    if (config.isProfiling && activeProfiler !== getProfiler()) {
      stopProfiling();
      startProfiling();
    }
    updateTimingAvailability();
  });
  vm.on("PROJECT_START", () => {
    profilingRestartNotice.hidden = true;
  });

  // Listen for blocks being updated/recreated and reapply heatmap if needed
  updateAllBlocksEvents.addEventListener("blocksUpdated", () => {
    if (config.showHeatmap) {
      setTimeout(() => {
        heatmapManager.showHeatmapFn(config.currentHeatmapMax);
      }, 10);
    }
  });

  // Handle sprite switching to reapply heatmap
  addon.tab.redux.addEventListener("statechanged", ({ detail }) => {
    if (detail.action.type === "scratch-gui/targets/UPDATE_TARGET_LIST") {
      if (config.showHeatmap) {
        setTimeout(() => {
          heatmapManager.showHeatmapFn(config.currentHeatmapMax);
        }, 10);
      }
    }
  });

  addon.settings.addEventListener("change", function () {
    updatePercentageHeader();
  });
  if (addon.settings.get("show_ratio_time") === true) updatePercentageHeader();

  // create the tab
  const tab = debug.createHeaderTab({
    text: msg("tab-timing"),
    icon: addon.self.getResource("/icons/timing.svg") /* rewritten by pull.js */,
  });

  return {
    tab,
    content,
    buttons: [exportButton, clearButton, lineByLineButton, heatmapButton],
    show: () => {
      tableRows.show();
      // Restart real-time heatmap updates when tab is shown
      if (config.showHeatmap) {
        heatmapManager.startRealtimeUpdates(config.currentHeatmapMax);
      }
    },
    hide: () => {
      tableRows.hide();
      // Stop real-time heatmap updates when tab is hidden
      if (config.showHeatmap) {
        heatmapManager.stopRealtimeUpdates();
      }
    },
    startTimer: (...args) => {
      timingManager.startTimer(...args);
    },
    stopTimer: (...args) => {
      timingManager.stopTimer(...args);
    },
    clearTimers: timingManager.clearTimers.bind(timingManager),
  };
}
