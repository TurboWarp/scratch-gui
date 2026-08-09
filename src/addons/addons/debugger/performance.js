import { onPauseChanged, isPaused } from "./module.js";
// TW: import chartjs as module
import "../../libraries/thirdparty/cs/chart.min.js";

export default async function createPerformanceTab({ debug, addon, console, msg }) {
  const vm = addon.tab.traps.vm;

  // TW: chartjs is now imported as module
  /*
  await addon.tab.loadScript("/libraries/thirdparty/cs/chart.min.js");
  */

  // In optimized graphs everything still looks good
  const fancyGraphs = addon.settings.get("fancy_graphs");
  const lineWidth = fancyGraphs ? 1 : 2;
  const lineColor = fancyGraphs ? "hsla(178, 65%, 45%, 0.5)" : "hsla(178, 65%, 45%, 1)";
  const getThemeColors = () => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      textColor: rootStyle.getPropertyValue("--ui-modal-foreground").trim() || "#575e75",
      gridColor: rootStyle.getPropertyValue("--ui-black-transparent").trim() || "rgba(0, 0, 0, 0.1)",
    };
  };
  const { textColor, gridColor } = getThemeColors();
  const scaleColorOptions = {
    ticks: {
      color: textColor,
    },
    grid: {
      borderColor: textColor,
      tickColor: textColor,
      color: gridColor,
    },
  };

  const tab = debug.createHeaderTab({
    text: msg("tab-performance"),
    icon: addon.self.getResource("/icons/performance.svg") /* rewritten by pull.js */,
  });

  const content = Object.assign(document.createElement("div"), {
    className: "sa-performance-tab-content",
  });

  const createChart = ({ title }) => {
    const titleElement = Object.assign(document.createElement("h2"), {
      textContent: title,
    });
    const canvas = Object.assign(document.createElement("canvas"), {
      className: "sa-debugger-chart",
    });
    return {
      title: titleElement,
      canvas,
    };
  };

  const now = () => performance.now();

  // TW: If FPS=0, that means we use rAF. We'll guess that requestAnimationFrame runs at 60Hz as it does in most places.
  // TW: but, we changed max to suggestedMax later on, so if we're wrong, that's OK
  const getMaxFps = () => vm.runtime.frameLoop.framerate === 0 ? 60 : vm.runtime.frameLoop.framerate;

  const NUMBER_OF_POINTS = 20;
  // An array like [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  const labels = Array.from(Array(NUMBER_OF_POINTS).keys()).reverse();

  const fpsElements = createChart({
    title: msg("performance-framerate-title"),
  });
  const fpsChart = new Chart(fpsElements.canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: Array(NUMBER_OF_POINTS).fill(-1),
          borderWidth: lineWidth,
          fill: fancyGraphs,
          backgroundColor: "#29beb8",
          borderColor: lineColor,
        },
      ],
    },
    options: {
      animation: fancyGraphs,
      scales: {
        x: {
          ...scaleColorOptions,
        },
        y: {
          // TW: this is a suggested max due to FPS=0 using rAF case
          suggestedMax: getMaxFps(),
          min: 0,
          ...scaleColorOptions,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => msg("performance-framerate-graph-tooltip", { fps: context.parsed.y }),
          },
        },
      },
    },
  });

  const clonesElements = createChart({
    title: msg("performance-clonecount-title"),
  });
  const performanceClonesChart = new Chart(clonesElements.canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: Array(NUMBER_OF_POINTS).fill(-1),
          borderWidth: lineWidth,
          fill: fancyGraphs,
          backgroundColor: "#29beb8",
          borderColor: lineColor,
        },
      ],
    },
    options: {
      animation: fancyGraphs,
      scales: {
        x: {
          ...scaleColorOptions,
        },
        y: {
          // TW: this is a suggested max due to FPS=0 using rAF case
          suggestedMax: 300,
          min: 0,
          ...scaleColorOptions,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => msg("performance-clonecount-graph-tooltip", { clones: context.parsed.y }),
          },
        },
      },
    },
  });

  // Holds the times of each frame drawn in the last second.
  // The length of this list is effectively the FPS.
  const renderTimes = [];

  // The last time we pushed a new datapoint to the graph
  let lastFpsTime = now() + 3000;

  debug.addAfterStepCallback(() => {
    if (isPaused()) {
      return;
    }
    const time = now();

    // Remove all frame times older than 1 second in renderTimes
    while (renderTimes.length > 0 && renderTimes[0] <= time - 1000) renderTimes.shift();
    renderTimes.push(time);

    if (time - lastFpsTime > 1000) {
      lastFpsTime = time;

      const maxFps = getMaxFps();
      const fpsData = fpsChart.data.datasets[0].data;
      fpsData.shift();
      fpsData.push(Math.min(renderTimes.length, maxFps));
      // Incase we switch between 30FPS and 60FPS, update the max height of the chart.
      // TW: this is a suggested max due to FPS=0 using rAF case
      fpsChart.options.scales.y.suggestedMax = maxFps;

      const clonesData = performanceClonesChart.data.datasets[0].data;
      clonesData.shift();
      clonesData.push(vm.runtime._cloneCounter);

      if (isVisible) {
        fpsChart.update();
        performanceClonesChart.update();
      }
    }
  });

  content.appendChild(fpsElements.title);
  content.appendChild(fpsElements.canvas);
  content.appendChild(clonesElements.title);
  content.appendChild(clonesElements.canvas);

  const updateChartTheme = () => {
    const themeColors = getThemeColors();
    for (const chart of [fpsChart, performanceClonesChart]) {
      for (const scale of Object.values(chart.options.scales)) {
        scale.ticks.color = themeColors.textColor;
        scale.grid.borderColor = themeColors.textColor;
        scale.grid.tickColor = themeColors.textColor;
        scale.grid.color = themeColors.gridColor;
      }
      chart.update();
    }
  };

  addon.tab.redux.addEventListener("statechanged", ({ detail }) => {
    if (detail.action.type === "scratch-gui/theme/SET_THEME") {
      // Wait for the new theme's CSS variables to be applied.
      requestAnimationFrame(updateChartTheme);
    }
  });

  let pauseTime = 0;
  onPauseChanged((paused) => {
    if (paused) {
      pauseTime = now();
    } else {
      const dt = now() - pauseTime;
      lastFpsTime += dt;
      for (var i = 0; i < renderTimes.length; i++) {
        renderTimes[i] += dt;
      }
    }
  });

  let isVisible = false;
  const show = () => {
    isVisible = true;
    updateChartTheme();
    window.dispatchEvent(new CustomEvent("saDebuggerPerformanceTabShown"));
  };
  const hide = () => {
    isVisible = false;
  };

  return {
    tab,
    content,
    buttons: [],
    show,
    hide,
  };
}
