// services/ftaCctmService.js
// Service for generating CCTM test cases using pure ECP + CTM method
// Based on FATCG framework from ICSEC research paper

/**
 * Generate CCTM test cases using pure Combined Classification Tree Method
 * CCTM = Equivalence Class Partitioning (ECP) + Classification Tree Method (CTM)
 * 
 * This is a pure black-box testing technique that:
 * 1. Partitions input domains into equivalence classes (ECP)
 * 2. Builds classification tree structure (CTM)
 * 3. Generates test cases through Cartesian product of all classes
 * 
 * Note: This does NOT use formulas or business rules - that's handled by FTA in other sections
 * 
 * @param {Object} params - Parameters for test case generation
 * @param {Array} params.variables - Array of variables from Data Dictionary
 * @param {Array} params.functions - Array of classifications with selected variables
 * @param {Array} params.formulas - IGNORED in pure CCTM (kept for backward compatibility)
 * @param {Array} params.invalidMappingTestCases - IGNORED in pure CCTM (handled by FTA)
 * @returns {Array} Generated test cases
 */
function generateCCTMTestCasesFromFormulas({ variables, functions, formulas, invalidMappingTestCases = [] }) {
  const testCases = [];
  let testCaseIndex = 1;

  // Helper function to check if a value is numeric
  const isNumeric = (value) => {
    if (value === '' || value === null || value === undefined) return false;
    return !isNaN(value) && !isNaN(parseFloat(value)) && isFinite(value);
  };

  // Helper functions to extract min/max from normalized variables
  const getVariableMin = (variable) => {
    if (variable.min !== undefined && variable.min !== '') return String(variable.min).trim();
    if (variable.variableType === 'range' && variable.conditions && variable.conditions.length > 0) {
      const mins = variable.conditions.map(c => parseFloat(c.min)).filter(v => !isNaN(v));
      return mins.length > 0 ? String(Math.min(...mins)) : '';
    }
    return '';
  };

  const getVariableMax = (variable) => {
    if (variable.max !== undefined && variable.max !== '') return String(variable.max).trim();
    if (variable.variableType === 'range' && variable.conditions && variable.conditions.length > 0) {
      const maxs = variable.conditions.map(c => parseFloat(c.max)).filter(v => !isNaN(v));
      return maxs.length > 0 ? String(Math.max(...maxs)) : '';
    }
    return '';
  };

  // Normalize variables to support both old format (min/max) and new format (conditions/values)
  const normalizeVariable = (variable) => {
    // If it's already in old format (has min/max directly), add computed properties
    if (variable.min !== undefined && variable.max !== undefined && variable.min !== '' && variable.max !== '') {
      return {
        ...variable,
        variableType: variable.variableType || (isNumeric(variable.min) ? 'range' : 'nominal'),
        conditions: variable.conditions || [{ min: variable.min, max: variable.max }],
        values: variable.values || (isNumeric(variable.min) ? [] : [variable.min, variable.max].filter(v => v !== '')),
      };
    }
    
    // New format: ensure min/max are computed for backward compatibility
    const normalized = { ...variable };
    if (!normalized.min) normalized.min = getVariableMin(normalized);
    if (!normalized.max) normalized.max = getVariableMax(normalized);
    return normalized;
  };

  // Normalize all variables
  const normalizedVariables = variables.map(normalizeVariable);

  // Process each classification (function)
  // Using PURE CCTM: ECP + CTM without formulas
  functions.forEach((func) => {
    // Get selected variables (using normalized variables)
    const selectedVars = normalizedVariables.filter((v) =>
      func.selectedVariables.includes(v.id)
    );

    if (selectedVars.length === 0) return;

    /**
     * PURE CCTM Algorithm:
     * Step 1: Generate Equivalence Classes for each variable (ECP)
     * Step 2: Build Classification Tree structure (CTM)
     * Step 3: Generate test cases using Cartesian product
     */

    // Step 1: Generate Equivalence Classes using ECP
    const generateEquivalenceClasses = (variable) => {
      const classes = [];

      // Handle Range type variables (numeric with partitions)
      if (variable.variableType === 'range' && variable.conditions && variable.conditions.length > 0) {
        // Get overall min and max from all partitions
        const allMins = variable.conditions.map(c => parseFloat(c.min)).filter(v => !isNaN(v));
        const allMaxs = variable.conditions.map(c => parseFloat(c.max)).filter(v => !isNaN(v));
        
        if (allMins.length > 0 && allMaxs.length > 0) {
          const overallMin = Math.min(...allMins);
          const overallMax = Math.max(...allMaxs);

          // Invalid class: below minimum
          classes.push({
            value: overallMin - 1,
            type: 'invalid',
            label: `< ${overallMin}`,
            partition: 'below_min'
          });

          // Valid classes: one representative from each partition
          variable.conditions.forEach((cond, idx) => {
            const partMin = parseFloat(cond.min);
            const partMax = parseFloat(cond.max);
            if (!isNaN(partMin) && !isNaN(partMax)) {
              const mid = (partMin + partMax) / 2;
              classes.push({
                value: mid,
                type: 'valid',
                label: `[${partMin}-${partMax}]`,
                partition: `partition_${idx + 1}`
              });
            }
          });

          // Invalid class: above maximum
          classes.push({
            value: overallMax + 1,
            type: 'invalid',
            label: `> ${overallMax}`,
            partition: 'above_max'
          });
        }
      }
      // Handle Nominal type variables (discrete string values)
      else if (variable.variableType === 'nominal' && variable.values && variable.values.length > 0) {
        // Valid classes: each discrete value
        variable.values.forEach((val, idx) => {
          if (val && val.trim() !== '') {
            classes.push({
              value: val.trim(),
              type: 'valid',
              label: val.trim(),
              partition: `value_${idx + 1}`
            });
          }
        });

        // Invalid class: N/A (not in valid values)
        classes.push({
          value: 'N/A',
          type: 'invalid',
          label: 'N/A (invalid)',
          partition: 'invalid'
        });
      }
      // Fallback: old format (min/max)
      else {
        const min = getVariableMin(variable);
        const max = getVariableMax(variable);
        const minIsNumeric = isNumeric(min);
        const maxIsNumeric = isNumeric(max);

        if (minIsNumeric && maxIsNumeric) {
          const minNum = parseFloat(min);
          const maxNum = parseFloat(max);
          const mid = (minNum + maxNum) / 2;

          // Standard ECP for numeric: < min, min, mid, max, > max
          classes.push({ value: minNum - 1, type: 'invalid', label: `< ${min}`, partition: 'below_min' });
          classes.push({ value: minNum, type: 'valid', label: `= ${min} (min)`, partition: 'at_min' });
          classes.push({ value: mid, type: 'valid', label: `= ${mid.toFixed(2)} (mid)`, partition: 'mid' });
          classes.push({ value: maxNum, type: 'valid', label: `= ${max} (max)`, partition: 'at_max' });
          classes.push({ value: maxNum + 1, type: 'invalid', label: `> ${max}`, partition: 'above_max' });
        } else {
          // String type: valid values + N/A
          if (min) classes.push({ value: min, type: 'valid', label: min, partition: 'value_1' });
          if (max && max !== min) classes.push({ value: max, type: 'valid', label: max, partition: 'value_2' });
          classes.push({ value: 'N/A', type: 'invalid', label: 'N/A (invalid)', partition: 'invalid' });
        }
      }

      return classes;
    };

    // Step 2: Build Classification Tree (variable -> classes mapping)
    const classificationTree = selectedVars.map((variable) => ({
      variable,
      classes: generateEquivalenceClasses(variable),
    }));

    // Step 3: Generate all combinations using Cartesian product
    const generateCombinations = (tree, index = 0, current = {}) => {
      if (index >= tree.length) {
        return [current];
      }

      const result = [];
      const { variable, classes } = tree[index];

      classes.forEach((classItem) => {
        const newCurrent = {
          ...current,
          [variable.variableName]: {
            value: classItem.value,
            type: classItem.type,
            label: classItem.label,
            partition: classItem.partition,
            variable: variable.variableName,
            min: getVariableMin(variable),
            max: getVariableMax(variable),
          },
        };
        result.push(...generateCombinations(tree, index + 1, newCurrent));
      });

      return result;
    };

    const allCombinations = generateCombinations(classificationTree);

    // Step 4: Create test cases from combinations
    allCombinations.forEach((combination) => {
      const hasInvalid = Object.values(combination).some((v) => v.type === 'invalid');
      const invalidVars = Object.entries(combination)
        .filter(([_, v]) => v.type === 'invalid')
        .map(([name, _]) => name);
      
      const expectedResult = hasInvalid ? 'Invalid' : 'Valid';
      const comment = hasInvalid
        ? `Invalid: ${invalidVars.join(', ')}`
        : 'All variables in valid partitions';

      testCases.push({
        id: `CCTM-${String(testCaseIndex++).padStart(3, '0')}`,
        functionName: func.functionName,
        variables: combination,
        expectedResult,
        source: 'CCTM (ECP+CTM)',
        formula: null,
        comment: comment
      });
    });
  });

  return testCases;
}

/**
 * Generate fault tree test cases (combining invalid range and invalid mapping)
 * @param {Object} params - Parameters for test case generation
 * @param {Array} params.invalidRangeTestCases - Invalid range test cases
 * @param {Array} params.invalidMappingTestCases - Invalid mapping test cases
 * @returns {Array} Combined test cases with renumbered IDs
 */
function generateFaultTreeTestCases({ invalidRangeTestCases = [], invalidMappingTestCases = [] }) {
  const allTestCases = [];
  let testCaseIndex = 1;

  // Add Invalid Range test cases
  invalidRangeTestCases.forEach((tc) => {
    allTestCases.push({
      ...tc,
      id: `TC-${String(testCaseIndex++).padStart(3, '0')}`,
      source: 'Invalid Range',
    });
  });

  // Add Invalid Mapping test cases
  invalidMappingTestCases.forEach((tc) => {
    allTestCases.push({
      ...tc,
      id: `TC-${String(testCaseIndex++).padStart(3, '0')}`,
      source: 'Invalid Mapping',
    });
  });

  return allTestCases;
}

module.exports = {
  generateCCTMTestCasesFromFormulas,
  generateFaultTreeTestCases,
};

