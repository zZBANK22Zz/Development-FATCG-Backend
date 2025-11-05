/**
 * CCTM Partition Builder
 * 
 * สร้าง partitions จาก CCTM variables สำหรับ test case generation
 * Partition format: { variable, reps: [{ tc, sample, variable }] }
 */

const cctmSampleGenerator = require('./cctmSampleGenerator');

/**
 * สร้าง partitions จาก CCTM variables
 * @param {Array} variables - Array of variables from CCTM parser
 * @returns {Array} Partitions array
 */
function createEcpPartitions(variables) {
  if (!Array.isArray(variables) || variables.length === 0) {
    return [];
  }

  const partitions = variables.map(variable => {
    // Skip variables with no terminal classes
    if (!variable.terminalClasses || variable.terminalClasses.length === 0) {
      return null;
    }

    // Create reps array: one rep per terminal class
    const reps = variable.terminalClasses.map(tc => ({
      tc, // terminal class object
      sample: cctmSampleGenerator.sampleValueOf(tc, variable.type),
      variable: variable
    }));

    return {
      variable: variable,
      reps: reps
    };
  }).filter(p => p !== null); // Remove null entries

  return partitions;
}

module.exports = { createEcpPartitions };

