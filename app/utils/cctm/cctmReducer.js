function applyReduction(testCases, opts = {}) {
    const cap = opts.cap || 10000;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < testCases.length && out.length < cap; i++) {
      const tc = testCases[i];
      const key = JSON.stringify(tc.data);
      if (!seen.has(key)) { seen.add(key); out.push(tc); }
    }
    return out;
  }
  
  module.exports = { applyReduction };
  