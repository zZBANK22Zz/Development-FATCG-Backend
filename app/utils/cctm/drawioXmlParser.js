/**
 * Draw.io XML Parser for CCTM
 * 
 * Parses draw.io/diagrams.net mxfile format and converts to CCTM tree structure
 */

const { parseStringPromise } = require('xml2js');

/**
 * Parse range string to extract numeric values
 */
function parseRangeString(value) {
  if (!value || typeof value !== 'string') return null;
  
  const trimmed = value.trim();
  
  // Handle HTML entities
  const decoded = trimmed
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  
  // Check for invalid patterns (inf, >, <)
  const hasInvalid = decoded.toLowerCase().includes('inf') || 
                     decoded.includes('>') || 
                     decoded.includes('<');
  
  // Try to extract numeric range
  const rangeMatch = decoded.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?|max|Max)/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = rangeMatch[2].toLowerCase() === 'max' ? Infinity : Number(rangeMatch[2]);
    return { min, max, valid: !hasInvalid };
  }
  
  // Try single number
  const numMatch = decoded.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const num = Number(numMatch[1]);
    return { min: num, max: num, valid: !hasInvalid };
  }
  
  // Check for comparison operators
  if (decoded.startsWith('<')) {
    const match = decoded.match(/<(\d+(?:\.\d+)?)/);
    if (match) {
      return { min: -Infinity, max: Number(match[1]) - 0.1, valid: false };
    }
  }
  if (decoded.startsWith('>')) {
    const match = decoded.match(/>(\d+(?:\.\d+)?)/);
    if (match) {
      return { min: Number(match[1]) + 0.1, max: Infinity, valid: false };
    }
  }
  
  return null;
}

/**
 * Determine variable type from terminal class values
 */
function inferVariableType(terminalClasses) {
  const values = terminalClasses.map(tc => tc.label || tc.value || '').join(' ').toLowerCase();
  
  if (values.includes('true') || values.includes('false')) {
    return 'boolean';
  }
  if (values.match(/\d/)) {
    return 'float';
  }
  if (values.includes('cc_') || values.includes('active') || values.includes('passive')) {
    return 'enum';
  }
  return 'string';
}

/**
 * Parse draw.io XML to CCTM structure
 */
async function parseDrawioXml(xmlString) {
  const doc = await parseStringPromise(xmlString, { 
    explicitArray: false, 
    mergeAttrs: true
  });

  // Find the diagram
  const diagram = doc.mxfile?.diagram;
  if (!diagram) {
    throw new Error('No diagram found in mxfile');
  }

  // Find mxGraphModel
  const graphModel = diagram.mxGraphModel;
  if (!graphModel) {
    throw new Error('No mxGraphModel found in diagram');
  }

  // Get all cells
  const root = graphModel.root;
  if (!root || !root.mxCell) {
    throw new Error('No cells found in mxGraphModel');
  }

  const cells = Array.isArray(root.mxCell) ? root.mxCell : [root.mxCell];
  
  // Build node map: id -> { id, value, style, type, parent, children, geometry }
  const nodeMap = new Map();
  const edges = [];
  
  // First pass: collect all nodes
  cells.forEach(cell => {
    if (!cell) return;
    
    // With mergeAttrs: true, attributes are directly on the object, not in $
    const id = cell.id || cell.$?.id;
    const edge = cell.edge || cell.$?.edge;
    const vertex = cell.vertex || cell.$?.vertex;
    const source = cell.source || cell.$?.source;
    const target = cell.target || cell.$?.target;
    const value = cell.value || cell.$?.value || '';
    const style = cell.style || cell.$?.style || '';
    const geometry = cell.mxGeometry || {};
    
    // Edge is explicitly set, or if it has source/target it's an edge
    const hasEdge = edge === '1' || edge === true || edge === 'true' || 
                    (source && target);
    // Vertex is explicitly set, or if it has value and no source/target it's a vertex
    const hasVertex = vertex === '1' || vertex === true || vertex === 'true' ||
                      (value && !source && !target);
    
    if (!id) return;
    
    // Determine node type from style
    let nodeType = 'unknown';
    if (style.includes('ellipse')) {
      nodeType = 'terminal';
    } else if (style.includes('rounded=0') && style.includes('strokeWidth=2')) {
      nodeType = 'variable'; // Variable nodes have thick border
    } else if (style.includes('rounded=0') && !style.includes('strokeWidth=2')) {
      // Could be useCase (root) or classification (intermediate)
      // We'll determine this later based on hierarchy
      nodeType = 'classification';
    }
    
    if (hasEdge) {
      if (source && target) {
        edges.push({ source, target, id });
      }
    } else if (hasVertex) {
      // Parse geometry (x, y can be in geometry directly or in geometry.$)
      const geoX = geometry.x || geometry.$?.x;
      const geoY = geometry.y || geometry.$?.y;
      
      nodeMap.set(id, {
        id,
        value: value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        style,
        type: nodeType,
        parent: null,
        children: [],
        geometry: {
          x: geoX ? Number(geoX) : 0,
          y: geoY ? Number(geoY) : 0
        }
      });
    }
  });
  
  // Second pass: build tree structure from edges
  edges.forEach(edge => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    
    if (sourceNode && targetNode) {
      targetNode.parent = sourceNode;
      if (!sourceNode.children.includes(targetNode)) {
        sourceNode.children.push(targetNode);
      }
    }
  });
  
  // Find root node (use case) - typically the topmost node with no parent
  let rootNode = null;
  
  // Find the topmost node with no parent (by Y coordinate)
  let topY = Infinity;
  for (const [id, node] of nodeMap.entries()) {
    if (!node.parent && node.geometry && node.geometry.y < topY) {
      topY = node.geometry.y;
      rootNode = node;
    }
  }
  
  // If still no root, find any node with no parent
  if (!rootNode) {
    for (const [id, node] of nodeMap.entries()) {
      if (!node.parent) {
        rootNode = node;
        break;
      }
    }
  }
  
  // Last resort: find the node with the smallest Y coordinate
  if (!rootNode) {
    topY = Infinity;
    for (const [id, node] of nodeMap.entries()) {
      if (node.geometry && node.geometry.y < topY) {
        topY = node.geometry.y;
        rootNode = node;
      }
    }
  }
  
  if (!rootNode) {
    throw new Error(`No root node (use case) found. Total nodes: ${nodeMap.size}, Edges: ${edges.length}`);
  }
  
  // Mark root node as useCase
  rootNode.type = 'useCase';
  
  // Extract use case info
  const useCase = {
    id: 'UC_Default',
    name: rootNode.value || 'Use Case',
    description: ''
  };
  
  // Build hierarchical structure preserving classifications
  // Structure: { type: 'variable'|'classification', name, children: [], terminalClasses: [] }
  function buildHierarchicalStructure(node, parentClassification = null) {
    if (!node) return null;
    
    // If this is a variable, extract it with terminal classes
    if (node.type === 'variable') {
      const varName = node.value;
      if (!varName) return null;
      
      const terminalClasses = node.children
        .filter(n => n.type === 'terminal')
        .map((tc, idx) => {
          const tcValue = tc.value || '';
          const parsed = parseRangeString(tcValue);
          
          const isInvalid = tcValue.toLowerCase().includes('invalid') ||
                           (parsed && parsed.valid === false) ||
                           tcValue.toLowerCase().includes('inf');
          
          if (parsed) {
            return {
              id: `${varName}-${tcValue}-${idx}`,
              label: tcValue,
              min: parsed.min,
              max: parsed.max,
              values: parsed.values,
              valid: !isInvalid
            };
          } else {
            return {
              id: `${varName}-${tcValue}-${idx}`,
              label: tcValue,
              values: [tcValue],
              valid: !isInvalid
            };
          }
        });
      
      if (terminalClasses.length > 0) {
        return {
          type: 'variable',
          name: varName,
          typeType: inferVariableType(terminalClasses),
          terminalClasses,
          parentClassification: parentClassification
        };
      }
      return null;
    }
    
    // If this is a classification node, collect its children
    if (node.type === 'classification') {
      const classificationName = node.value;
      const children = [];
      
      // Process children: variables and sub-classifications
      node.children.forEach(child => {
        if (child.type === 'variable') {
          const varStruct = buildHierarchicalStructure(child, classificationName);
          if (varStruct) children.push(varStruct);
        } else if (child.type === 'classification') {
          const subStruct = buildHierarchicalStructure(child, classificationName);
          if (subStruct) children.push(subStruct);
        }
      });
      
      if (children.length > 0) {
        return {
          type: 'classification',
          name: classificationName,
          children
        };
      }
      return null;
    }
    
    return null;
  }
  
  // Build structure from root
  const structure = [];
  rootNode.children.forEach(child => {
    if (child.type === 'variable') {
      const varStruct = buildHierarchicalStructure(child);
      if (varStruct) structure.push(varStruct);
    } else if (child.type === 'classification') {
      const classStruct = buildHierarchicalStructure(child);
      if (classStruct) structure.push(classStruct);
    }
  });
  
  // Merge classification nodes with same variable children
  // Group classifications by their variable children
  const classificationMap = new Map();
  const directVariables = [];
  
  structure.forEach(item => {
    if (item.type === 'variable') {
      directVariables.push(item);
    } else if (item.type === 'classification') {
      // Create key from sorted variable names in this classification
      const varNames = getAllVariableNames(item).sort().join(',');
      if (!classificationMap.has(varNames)) {
        classificationMap.set(varNames, []);
      }
      classificationMap.get(varNames).push(item);
    }
  });
  
  // Merge classifications with same variable children
  const mergedClassifications = [];
  classificationMap.forEach((classifications, varNames) => {
    if (classifications.length === 0) return;
    
    // Merge all classifications with same structure
    const merged = {
      type: 'classification',
      name: classifications.map(c => c.name).join('/'), // e.g., "CC_Resume/BrakePedalPressed/AccPedalReleased"
      children: classifications[0].children // All have same structure, so use first one
    };
    
    mergedClassifications.push(merged);
  });
  
  // Flatten to variables array for CCTM format
  // But preserve parent classification information
  const variables = [];
  
  // Add direct variables
  directVariables.forEach(v => {
    variables.push({
      name: v.name,
      type: v.typeType,
      terminalClasses: v.terminalClasses,
      parentClassification: null
    });
  });
  
  // Add variables from merged classifications
  mergedClassifications.forEach(classification => {
    classification.children.forEach(child => {
      if (child.type === 'variable') {
        const existingVar = variables.find(v => v.name === child.name);
        if (existingVar) {
          // Merge terminal classes if variable already exists
          const existingLabels = new Set(existingVar.terminalClasses.map(tc => tc.label));
          child.terminalClasses.forEach(tc => {
            if (!existingLabels.has(tc.label)) {
              existingVar.terminalClasses.push(tc);
              existingLabels.add(tc.label);
            }
          });
          // Update parent classification
          if (!existingVar.parentClassification) {
            existingVar.parentClassification = classification.name;
          } else if (!existingVar.parentClassification.includes(classification.name)) {
            existingVar.parentClassification = `${existingVar.parentClassification}/${classification.name}`;
          }
        } else {
          variables.push({
            name: child.name,
            type: child.typeType,
            terminalClasses: child.terminalClasses,
            parentClassification: classification.name
          });
        }
      }
    });
  });
  
  // Helper function to get all variable names from a classification structure
  function getAllVariableNames(node) {
    if (node.type === 'variable') {
      return [node.name];
    }
    if (node.type === 'classification') {
      const names = [];
      node.children.forEach(child => {
        names.push(...getAllVariableNames(child));
      });
      return names;
    }
    return [];
  }
  
  // Build merged tree structure for visualization
  // Structure matches the diagram: root -> direct variables + merged classifications -> variables -> terminal classes
  const mergedTreeStructure = {
    useCase: useCase.name,
    children: []
  };
  
  // Add direct variables (like CurrentSpeed)
  directVariables.forEach(v => {
    mergedTreeStructure.children.push({
      type: 'variable',
      name: v.name,
      terminalClasses: v.terminalClasses
    });
  });
  
  // Add merged classifications (like CC_Resume/BrakePedalPressed/AccPedalReleased)
  mergedClassifications.forEach(classification => {
    mergedTreeStructure.children.push({
      type: 'classification',
      name: classification.name,
      children: classification.children.map(child => ({
        type: 'variable',
        name: child.name,
        terminalClasses: child.terminalClasses
      }))
    });
  });
  
  // Extract output (if any terminal classes are connected to root but not to variables)
  let output = null;
  const allVarNodes = variables.map(v => v.name);
  const outputNodes = rootNode.children.filter(n => 
    n.type === 'terminal' && 
    !allVarNodes.some(vName => n.value && n.value.includes(vName))
  );
  
  if (outputNodes.length > 0) {
    const outputTerminalClasses = outputNodes.map((tc, idx) => ({
      id: `output-${tc.value}-${idx}`,
      label: tc.value,
      value: tc.value,
      valid: true
    }));
    
    output = {
      name: 'controllerAction',
      terminalClasses: outputTerminalClasses
    };
  }
  
  return {
    useCase,
    variables,
    output,
    system: useCase.name || 'System',
    mergedTreeStructure // Add merged tree structure for visualization
  };
}

module.exports = { parseDrawioXml };

