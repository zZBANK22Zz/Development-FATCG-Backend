function buildClassificationTree(variables) {
    // Optionally transform or validate variables
    return variables.map(v => ({ ...v }));
  }
  
  module.exports = buildClassificationTree;
  