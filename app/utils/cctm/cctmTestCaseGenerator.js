// app/utils/cctm/cctmTestCaseGenerator.js
const { sampleValueOf } = require('./cctmSampleGenerator');

/**
 * partitions: [{ variable, reps: [{ tc, sample, variable }] }]
 * options: { threshold } -- max allowed combos
 */
function cartesianProduct(arrays) {
  return arrays.reduce((acc, arr) => acc.flatMap(a => arr.map(b => a.concat([b]))), [[]]);
}

function estimateSize(arrays) {
  return arrays.reduce((s, a) => s * Math.max(1, a.length), 1);
}

function generateTestCases(partitions, options = {}) {
  const threshold = options.threshold || 10000;

  // convert partitions to arrays of reps
  const arrays = partitions.map(p => {
    if (p.reps) return p.reps;
    // if input is Variable[] fallback: map terminalClasses -> reps
    if (p.terminalClasses) {
      return p.terminalClasses.map(tc => ({ tc, sample: sampleValueOf(tc, p.type), variable: p }));
    }
    return [];
  });

  const size = estimateSize(arrays);
  if (size > threshold) {
    // simple random-sampling strategy: sample `threshold` combos
    const out = [];
    for (let i = 0; i < threshold; i++) {
      const combo = arrays.map(arr => arr[Math.floor(Math.random() * arr.length)]);
      const data = {};
      combo.forEach(item => { data[item.variable.name] = item.sample; });
      out.push({ id: `TC-${i+1}`, data, meta: combo.map(c => c.tc.id) });
    }
    return out;
  }

  const raw = cartesianProduct(arrays);
  const tcs = raw.map((combo, idx) => {
    const data = {};
    combo.forEach(item => { data[item.variable.name] = item.sample; });
    return { id: `TC-${idx+1}`, data, meta: combo.map(c => c.tc.id) };
  });

  // dedupe by canonical JSON
  const seen = new Set();
  const dedup = [];
  for (const tc of tcs) {
    const key = JSON.stringify(Object.keys(tc.data).sort().reduce((acc, k) => { acc[k] = tc.data[k]; return acc; }, {}));
    if (!seen.has(key)) { seen.add(key); dedup.push(tc); }
  }
  return dedup;
}

module.exports = generateTestCases;
