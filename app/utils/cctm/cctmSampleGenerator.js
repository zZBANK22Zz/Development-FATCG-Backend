function sampleValueOf(tc, type) {
    if (type === 'number') {
      if (typeof tc.min === 'number' && typeof tc.max === 'number') {
        return Math.floor((tc.min + tc.max) / 2);
      }
      if (typeof tc.min === 'number') return tc.min + 1;
      if (typeof tc.max === 'number') return tc.max - 1;
      return 0;
    }
  
    if (type === 'enum' || type === 'string') {
      if (Array.isArray(tc.values) && tc.values.length > 0) return tc.values[0];
      return '__INVALID__';
    }
  
    if (type === 'boolean') return !!tc.valid;
    return null;
  }
  
  module.exports = { sampleValueOf };
  