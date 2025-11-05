function sampleValueOf(tc, type) {
    // Handle numeric types (number, float)
    if (type === 'number' || type === 'float') {
      if (typeof tc.min === 'number' && typeof tc.max === 'number') {
        // For float, use decimal midpoint; for integer, use integer midpoint
        if (type === 'float') {
          return (tc.min + tc.max) / 2;
        }
        return Math.floor((tc.min + tc.max) / 2);
      }
      if (typeof tc.min === 'number') {
        // If only min, use min + small offset
        return type === 'float' ? tc.min + 0.1 : tc.min + 1;
      }
      if (typeof tc.max === 'number') {
        // If only max, use max - small offset
        return type === 'float' ? tc.max - 0.1 : tc.max - 1;
      }
      // Handle infinity cases
      if (tc.min === -Infinity && typeof tc.max === 'number') {
        return tc.max - 1;
      }
      if (tc.max === Infinity && typeof tc.min === 'number') {
        return tc.min + 1;
      }
      return 0;
    }
  
    // Handle enum/string types
    if (type === 'enum' || type === 'string') {
      if (Array.isArray(tc.values) && tc.values.length > 0) {
        return tc.values[0];
      }
      // If no values but has label, try to use label
      if (tc.label && !tc.label.includes('invalid')) {
        return tc.label;
      }
      return '__INVALID__';
    }
  
    // Handle boolean type
    if (type === 'boolean') {
      // Check if terminal class has explicit boolean values
      if (Array.isArray(tc.values) && tc.values.length > 0) {
        return tc.values[0];
      }
      // Check if label indicates boolean value
      if (tc.label === 'enabled' || tc.label === 'yes') return true;
      if (tc.label === 'disabled' || tc.label === 'no') return false;
      // Default based on valid flag
      return tc.valid !== false;
    }
  
    // Handle percentage type (similar to float)
    if (type === 'percentage') {
      if (typeof tc.min === 'number' && typeof tc.max === 'number') {
        return (tc.min + tc.max) / 2;
      }
      if (typeof tc.min === 'number') return tc.min + 0.1;
      if (typeof tc.max === 'number') return tc.max - 0.1;
      return 50; // default percentage
    }
  
    return null;
  }
  
  module.exports = { sampleValueOf };
  