// utils/ecp/ecpCrossProductGenerator.js
// Purpose: Generate VALID ECP test cases by taking the Cartesian product
// of valid partitions derived solely from the Data Dictionary (Usecase XML).
// This ignores the Decision Tree intentionally to demonstrate the concept.
//
// Output shape (per test case):
//   { testCaseID, type: 'Valid', inputs: MapLike, expected: {} }
//
// Notes:
// - For Range inputs, we use the midpoint from the data dictionary as the
//   representative sample value for each valid bucket.
// - For Nominal/Ordinal inputs, we use the literal category value.
// - We DO NOT include underflow/overflow/none buckets here (valid-only).
// - Optionally, callers can restrict included variables via options.onlyVars.

const { processDataDictionary } = require('./ecpXmlParsers');

/**
 * Build valid partitions (no underflow/overflow/none) from the data dictionary.
 * Partition: { name, items: [{ id, label, sample }] }
 */
async function buildValidPartitions(dataDictionaryPath) {
  const {
    inputsMeta,       // [ { varName, type } ]
    rangeConditions,  // [ { id, varName, min, max, mid } ]
    typeConditions,   // [ { id, varName, label } ]
  } = await processDataDictionary(dataDictionaryPath);

  const partitions = [];

  for (const { varName, type } of inputsMeta) {
    if (type === 'Range') {
      const buckets = rangeConditions
        .filter(r => r.varName === varName)
        .sort((a, b) => a.min - b.min);
      if (!buckets.length) continue;
      const items = buckets.map(b => ({
        id: b.id,
        label: (b.min === b.max) ? String(b.min) : `(${b.min}, ${b.max})`,
        sample: b.mid
      }));
      partitions.push({ name: varName, items });
    } else if (type === 'Nominal' || type === 'Ordinal') {
      const cats = typeConditions.filter(t => t.varName === varName);
      if (!cats.length) continue;
      const items = cats.map(c => ({ id: c.id, label: c.label, sample: c.label }));
      partitions.push({ name: varName, items });
    }
  }

  return partitions.filter(p => p.items && p.items.length > 0);
}

/** Cartesian product helper: [[a,b],[c,d]] => [[a,c],[a,d],[b,c],[b,d]] */
function cartesian(arrays) {
  return arrays.reduce((acc, curr) => {
    if (acc.length === 0) return curr.map(x => [x]);
    const next = [];
    for (const prefix of acc) {
      for (const x of curr) next.push([...prefix, x]);
    }
    return next;
  }, []);
}

/**
 * Generate VALID ECP test cases using cartesian product of valid partitions.
 *
 * @param {string|Buffer} dataDictionaryPath
 * @param {object} [options]
 * @param {string[]} [options.onlyVars]  Optional subset of variable names to include
 * @returns {Promise<Array<{ testCaseID: string, type: string, inputs: object, expected: object }>>}
 */
async function generateValidCrossProductCases(dataDictionaryPath, options = {}) {
  const { onlyVars } = options;

  const partitions = await buildValidPartitions(dataDictionaryPath);
  const usedPartitions = Array.isArray(onlyVars) && onlyVars.length
    ? partitions.filter(p => onlyVars.includes(p.name))
    : partitions;

  if (!usedPartitions.length) return [];

  const comboArrays = usedPartitions.map(p => p.items.map(it => ({ var: p.name, item: it })));
  const combos = cartesian(comboArrays);

  const testCases = [];
  let idx = 1;
  for (const combo of combos) {
    const inputs = {};
    for (const { var: varName, item } of combo) {
      inputs[varName] = item.sample;
    }
    testCases.push({
      testCaseID: `TC${String(idx++).padStart(3, '0')}`,
      type: 'Valid',
      inputs,
      expected: {}
    });
  }

  return testCases;
}

module.exports = {
  buildValidPartitions,
  generateValidCrossProductCases,
};
