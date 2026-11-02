// How long the worker sleeps between samples, in milliseconds.
const SAMPLE_INTERVAL = 0.1;
// How often the worker sends its accumulated samples to the main thread, in milliseconds.
const REPORT_INTERVAL = 100;

// Runs in a worker. Every iteration it reads the location that the VM is currently executing and
// attributes the time elapsed since the previous sample to it.
const workerSource = `
const SAMPLE_INTERVAL = ${SAMPLE_INTERVAL};
const REPORT_INTERVAL = ${REPORT_INTERVAL};
onmessage = (e) => {
  const pc = e.data.pc;
  const sleep = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  let times = new Map();
  let last = performance.now();
  let lastReport = last;
  while (true) {
    Atomics.wait(sleep, 0, 0, SAMPLE_INTERVAL);
    const location = Atomics.load(pc, 0);
    const now = performance.now();
    times.set(location, (times.get(location) || 0) + now - last);
    last = now;
    if (now - lastReport >= REPORT_INTERVAL) {
      postMessage(times);
      times = new Map();
      lastReport = now;
    }
  }
};
`;

// Profiles compiled threads using the VM's sampler.
class SamplingProfiler {
  constructor(vm, msg) {
    this.vm = vm;
    this.isProfiling = false;
    this.tm = null;
    this.worker = null;
    this.workerURL = null;

    const Sampler = vm.exports.Sampler;
    this.Sampler = Sampler;
    const reserved = (name) => ({ label: msg(`timing-${name}`), help: msg(`timing-${name}-help`) });
    this.reservedLabels = Sampler
      ? new Map([
          [Sampler.RUNTIME, reserved("runtime")],
          [Sampler.RENDERER, reserved("renderer")],
          [Sampler.WARP_TIMER, reserved("warp-timer")],
          [Sampler.UNPROFILED, reserved("unprofiled")],
          [Sampler.GUI_UPDATES, reserved("gui-updates")],
        ])
      : new Map();
  }

  isAvailable() {
    return !!this.Sampler && this.vm.runtime.sampler.isAvailable();
  }

  start() {
    if (this.isProfiling) return;
    this.isProfiling = true;

    const sampler = this.vm.runtime.sampler;
    sampler.setEnabled(this.Sampler.LEVEL_COUNTS);
    sampler.resetCounts();

    if (!this.workerURL) {
      this.workerURL = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    }
    this.worker = new Worker(this.workerURL);
    this.worker.onmessage = (e) => this.handleSamples(e.data);
    this.worker.postMessage({ pc: sampler.pc });
  }

  stop() {
    if (!this.isProfiling) return;
    this.isProfiling = false;

    this.worker.terminate();
    this.worker = null;
    this.vm.runtime.sampler.setEnabled(0);
  }

  handleSamples(times) {
    if (!this.isProfiling) return;

    const sampler = this.vm.runtime.sampler;
    // Counts accumulate in the VM until we read and reset them here
    const counts = sampler.counts;
    for (const [location, time] of times) {
      this.addLocation(location, time, counts[location]);
    }

    // Fast blocks can run many times without ever being sampled
    for (let location = 0; location < counts.length; location++) {
      if (counts[location] > 0 && !times.has(location)) {
        this.addLocation(location, 0, counts[location]);
      }
    }
    sampler.resetCounts();
  }

  addLocation(location, time, calls) {
    const key = `profile:${location}`;
    if (location >= this.Sampler.FIRST_BLOCK) {
      const { spriteId, blockId } = this.vm.runtime.sampler.locationToBlock(location);
      this.tm.addProfileTime(key, time, spriteId, blockId, undefined, calls);
    } else if (this.reservedLabels.has(location)) {
      const { label, help } = this.reservedLabels.get(location);
      this.tm.addProfileTime(key, time, null, null, label, calls, help);
    }
  }
}

export default SamplingProfiler;
