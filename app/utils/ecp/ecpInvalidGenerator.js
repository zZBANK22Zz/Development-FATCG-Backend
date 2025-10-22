// utils/ecp/ecpInvalidGenerator.js
// Purpose: Generate ONLY INVALID (negative) ECP test cases from the
// Data Dictionary. Does not depend on the Decision Tree.
// Exports: async function generateInvalidEcpCases(ddPath|Buffer) -> Array<TestCase>
// TestCase shape: { testCaseID, type: 'Invalid', inputs: MapLike, expected: MapLike }
// Strategy:
//  - For Range inputs: produce underflow and overflow values.
//  - For Nominal/Ordinal inputs: produce a None/null value if categories exist.
// ID assignment is local (starts at 1); the service renumbers to follow valids.
const { processDataDictionary } = require('./ecpXmlParsers');

// Generates ONLY invalid (negative) ECP cases based on the Data Dictionary.
// It does not parse or depend on the Decision Tree.
module.exports = async function generateInvalidEcpCases(dataDictionaryPath) {
  const {
    inputsMeta,
    outputMeta,
    rangeConditions,
    typeConditions
  } = await processDataDictionary(dataDictionaryPath);

  // Only consider inputs that actually participate in ECP via <Condition>
  const ecpRangeVars = new Set(rangeConditions.map(r => r.varName));
  const ecpNomVars   = new Set(typeConditions.map(t => t.varName));
  const ecpVarSet    = new Set([...ecpRangeVars, ...ecpNomVars]);

  const testCases = [];

  // --- Add invalid/out-of-range partition cases (ECP negative tests) ---
  // Build a typical (baseline) input map (only for vars that have <Condition>)
  const baselineInputs = {};
  for (const { varName, type } of inputsMeta.filter(i => ecpVarSet.has(i.varName))) {
    if (type === 'Range') {
      // choose the mid of the smallest-range bucket for determinism
      const buckets = rangeConditions
        .filter(r => r.varName === varName)
        .sort((a, b) => a.min - b.min);
      baselineInputs[varName] = buckets.length ? buckets[0].mid : null;
    } else if (type === 'Nominal' || type === 'Ordinal') {
      const cats = typeConditions.filter(t => t.varName === varName);
      baselineInputs[varName] = cats.length ? cats[0].label : null;
    } else {
      baselineInputs[varName] = null;
    }
  }
  
  // Helper to clone baseline then override
  function withOverride(name, value) {
    const obj = { ...baselineInputs };
    obj[name] = value;
    return obj;
  }
  
  // Determine next ID index (starts at 1; final renumbering happens in service)
  let nextIndex = 1;
  const outVar = outputMeta?.varName;
  const mkExpected = (varName) => (outVar ? { [outVar]: `Invalid ${varName}` } : {});
  
  // Generate invalid cases per input (only those with <Condition>)
  for (const { varName, type } of inputsMeta.filter(i => ecpVarSet.has(i.varName))) {
    if (type === 'Range') {
      const ranges = rangeConditions
        .filter(r => r.varName === varName)
        .sort((a, b) => a.min - b.min);
      if (ranges.length) {
        const globalMin = ranges[0].min;
        const globalMax = ranges[ranges.length - 1].max;
        const underflow = Number.isFinite(globalMin) ? globalMin - 1 : null;
        const overflow  = Number.isFinite(globalMax) ? globalMax + 1 : null;
        if (underflow !== null) {
          testCases.push({
            testCaseID: `TC${String(nextIndex++).padStart(3, '0')}`,
            type: 'Invalid',
            inputs: withOverride(varName, underflow),
            expected: mkExpected(varName)
          });
        }
        if (overflow !== null) {
          testCases.push({
            testCaseID: `TC${String(nextIndex++).padStart(3, '0')}`,
            type: 'Invalid',
            inputs: withOverride(varName, overflow),
            expected: mkExpected(varName)
          });
        }
      }
    } else if (type === 'Nominal' || type === 'Ordinal') {
      // Only include the None/null invalid case for variables that have categories
      const cats = typeConditions.filter(t => t.varName === varName);
      if (!cats.length) continue;
      testCases.push({
        testCaseID: `TC${String(nextIndex++).padStart(3, '0')}`,
        type: 'Invalid',
        inputs: withOverride(varName, null),
        expected: mkExpected(varName)
      });
    }
  }

  return testCases;
};