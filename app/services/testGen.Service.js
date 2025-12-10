// services/testGenService.js
const { stringify } = require('csv-stringify/sync');

const buildEcpPartitions = require('../utils/ecp/ecpPartitionBuilder');
const generateInvalidEcpCases = require('../utils/ecp/ecpInvalidGenerator');
const { generateValidEcpFromFiles } = require('../utils/ecp/ecpValidGenerator');
const { processSyntaxDefs } = require('../utils/syntax/syntaxParser');
const { generateSyntaxTests } = require('../utils/syntax/syntaxTestGenerator');
// const { processStateDefs } = require('../utils/stateTransition/stateMachineXmlParser');
// const { buildTransitionMatrix } = require('../utils/stateTransition/stateTransitionMatrixBuilder');
// const { buildStateTree } = require('../utils/stateTransition/stateTreeUnfolder');

// helper: shape single-transition rows for UI/CSV (5 columns)
function buildStateTestRows(validCases, invalidCases) {
  const merged = [
    ...validCases.map(validCase => ({ type: 'Valid', from: validCase.from, to: validCase.to })),
    ...invalidCases.map(invalidCase => ({ type: 'Invalid', from: invalidCase.from, to: invalidCase.to }))
  ];

  return merged.map((row, index) => ({
    testCaseID: `TC${String(index + 1).padStart(3, '0')}`,
    type: row.type,
    startState: row.from,
    transitionDescription: `${row.from} → ${row.to}`,
    // IMPORTANT: for invalid we still set expectedState = attempted destination
    expectedState: row.to
  }));
}

function shouldForceExcelText(fieldName, value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (/^\d{15,}$/.test(trimmed)) return true;
  if (/^\d{2}(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}$/.test(trimmed)) return true;
  return false;
}

function ensureExcelText(fieldName, value) {
  if (typeof value !== 'string') return value;
  if (!shouldForceExcelText(fieldName, value)) return value;
  if (value.startsWith('="')) return value;
  const escaped = value.replace(/"/g, '""');
  return `="${escaped}"`;
}

module.exports.generateAll = async (
  dataDictionaryPath,
  decisionTreePath,
  stateMachinePath
) => {
  // 1) ECP
  const partitions = await buildEcpPartitions(dataDictionaryPath);
  // Option B: Use map-based resolver for valid cases, merge with legacy invalids
  const validCases = await generateValidEcpFromFiles(
    dataDictionaryPath,
    decisionTreePath
  );
  // Generate only invalids from DD (decision tree not needed here)
  const invalidCases = await generateInvalidEcpCases(
    dataDictionaryPath
  );
  // Renumber invalids to continue after the last valid case ID
  const startIdx = validCases.length + 1;
  const renumberedInvalids = invalidCases.map((tc, i) => ({
    ...tc,
    testCaseID: `TC${String(startIdx + i).padStart(3, '0')}`
  }));
  const testCases = [...validCases, ...renumberedInvalids];

  // 2) Syntax
  const syntaxDefs = await processSyntaxDefs(dataDictionaryPath);
  const syntaxResults = generateSyntaxTests(syntaxDefs);

  // 3) State (optional)
  let stateTests = [];       // five-column rows for UI/CSV
  let stateCsvData = '';     // CSV for single-transition 5-column table
  let stateSequences = [];   // sequences (array of { seqCaseID, sequence[] })
  let stateSeqCsvData = '';  // CSV for sequences (2 columns)
  let _stateTreeNodes = [];
  let _stateTreeLinks = [];

  if (stateMachinePath) {
    // parse state machine (must include initialId/finalIds from your updated parser)
    const { states, transitions, initialId, finalIds } =
      await processStateDefs(stateMachinePath);

    // build matrix and derive valid/invalid single transitions
    const { validCases, invalidCases } = buildTransitionMatrix({
      states,
      transitions,
      initial: initialId || 'Initial',
      finals: finalIds || [],
      includeInitialToFinalInvalid: false
    });

    // 3.1) build 5-column rows (UI table + CSV)
    stateTests = buildStateTestRows(validCases, invalidCases);

    // --- State CSV (single-step) ---
    const singleHeader = [
      'Test Case ID',
      'Type',
      'Start State',
      'Transition Description',
      'Expected State',
      'Coverage (%)'
    ];

    const totalSingles = Math.max(stateTests.length, 1);
    const singleRows = stateTests.map((row, index) => [
      row.testCaseID,
      row.type,
      row.startState,
      row.transitionDescription,
      row.expectedState,
      `${(((index + 1) / totalSingles) * 100).toFixed(2)}%`
    ]);

    stateCsvData = stringify([singleHeader, ...singleRows]);

    // 3.2) Build unfolded state tree (event-labeled links)
    const { nodes: stateTreeNodes, links: stateTreeLinks } = buildStateTree({
      transitions,
      initialId,
      finalIds,
      maxDepth: 8,
      filterBounce: true,
      maxRepeatsPerState: 2,
      appendDuplicateIndex: true
    });

    _stateTreeNodes = stateTreeNodes;
    _stateTreeLinks = stateTreeLinks;

    // 3.3) sequences derived from the tree (root-to-leaf paths by labels)
    const adj = new Map(); // key -> [{toKey, event}]
    const incoming = new Map();
    for (const link of stateTreeLinks) {
      if (!adj.has(link.from)) adj.set(link.from, []);
      adj.get(link.from).push({ to: link.to, event: link.text || '' });
      incoming.set(link.to, (incoming.get(link.to) || 0) + 1);
      if (!incoming.has(link.from)) incoming.set(link.from, incoming.get(link.from) || 0);
    }
    const nodeByKey = new Map((stateTreeNodes || []).map(node => [node.key, node]));

    // choose root: prefer node with label == initialId (or 'Initial'), else any with no incoming
    let roots = Array.from((stateTreeNodes || []).map(n => n.key).filter(k => (incoming.get(k) || 0) === 0));
    let rootKey = roots.find(k => nodeByKey.get(k)?.label === (initialId || 'Initial'))
      || roots.find(k => String(nodeByKey.get(k)?.label).toLowerCase() === 'initial')
      || roots[0] || null;

    const seqSet = new Set();
    const seqList = [];
    const seqFormatted = [];
    function dfsTree(nodeKey, pathLabels, pathEvents) {
      const children = adj.get(nodeKey) || [];
      if (children.length === 0) {
        const seqKey = pathLabels.join('→');
        if (!seqSet.has(seqKey)) {
          seqSet.add(seqKey);
          const labels = pathLabels.slice();
          seqList.push(labels);
          const text = (() => {
            if (!Array.isArray(pathEvents) || pathEvents.length === 0) return labels.join(' → ');
            const parts = [labels[0]];
            for (let index = 0; index < pathEvents.length; index++) {
              const eventLabel = pathEvents[index];
              parts.push(eventLabel ? `-(${eventLabel})->` : '->', labels[index + 1]);
            }
            return parts.join(' ');
          })();
          seqFormatted.push(text);
        }
        return;
      }
      for (const child of children) {
        const node = nodeByKey.get(child.to);
        const lbl = node ? node.label : child.to;
        pathLabels.push(lbl);
        const evs = Array.isArray(pathEvents) ? pathEvents : [];
        evs.push(child.event || '');
        dfsTree(child.to, pathLabels, evs);
        evs.pop();
        pathLabels.pop();
      }
    }

    if (!rootKey) {
      stateSequences = [];
    } else {
      const rootLabel = nodeByKey.get(rootKey)?.label || 'Initial';
      dfsTree(rootKey, [rootLabel], []);
      stateSequences = seqList.map((sequence, index) => ({
        seqCaseID: `TC${String(index + 1).padStart(3, '0')}`,
        sequence
      }));
    }

    // sequences CSV (with Coverage)
    const seqHeader = ['Test Case ID', 'Sequence (events)', 'Coverage (%)'];
    const totalSeq = Math.max(stateSequences.length, 1);
    const seqRows = stateSequences.map((sequenceItem, index) => [
      `TC${String(index + 1).padStart(3, '0')}`,
      (seqFormatted && seqFormatted[index]) ? seqFormatted[index] : sequenceItem.sequence.join(' → '),
      `${(((index + 1) / totalSeq) * 100).toFixed(2)}%`
    ]);
    stateSeqCsvData = stringify([seqHeader, ...seqRows]);
  }

  // 4) ECP CSV (with Coverage)
  const ecpInputKeys = testCases.length ? Object.keys(testCases[0].inputs) : [];
  const ecpExpectedKeys = testCases.length ? Object.keys(testCases[0].expected) : [];
  const ecpHeader = ['Test Case ID', 'Type', ...ecpInputKeys, ...ecpExpectedKeys, 'Coverage (%)'];
  const totalEcp = Math.max(testCases.length, 1);
  const ecpRows = testCases.map((tc, idx) => [
    tc.testCaseID,
    tc.type || 'Valid',
    ...ecpInputKeys.map(k => tc.inputs[k]),
    ...ecpExpectedKeys.map(k => tc.expected[k]),
    `${(((idx + 1) / totalEcp) * 100).toFixed(2)}%`
  ]);
  const ecpCsvData = stringify([ecpHeader, ...ecpRows]);

  // 5) Syntax CSV
  const synHeader = ['Name', 'valid', 'invalidValue', 'invalidOmission', 'invalidAddition', 'invalidSubstitution'];
  const synRows = syntaxResults.map(syntaxItem => {
    const values = syntaxItem.testCases;
    return [
      syntaxItem.name,
      ensureExcelText(syntaxItem.name, values.valid),
      ensureExcelText(syntaxItem.name, values.invalidValue),
      ensureExcelText(syntaxItem.name, values.invalidOmission),
      ensureExcelText(syntaxItem.name, values.invalidAddition),
      ensureExcelText(syntaxItem.name, values.invalidSubstitution)
    ];
  });
  const syntaxCsvData = stringify([synHeader, ...synRows]);

  // 6) Combined CSV (unchanged layout, but now fed from new state rows)
  const combinedHeader = [
    'Technique',
    ...ecpHeader,
    ...synHeader,
    'Seq/State Type',
    'ID',
    'Start/Path',
    'Event',
    'Expected/Coverage'
  ];

  // Map single transitions to "State" rows in combined (Event column unused, pass empty)
  const combinedStateRows = stateTests.map(row => [
    'State',
    ...Array(ecpHeader.length + synHeader.length).fill(''),
    row.type,
    row.testCaseID,
    row.transitionDescription, // put full "from --> to" in Start/Path
    '',                      // Event (unused in new table)
    row.expectedState
  ]);

  // Map sequences to "Seq" rows in combined (fill coverage in last column)
  const totalSeqForCombined = Math.max(stateSequences.length, 1);
  const combinedSeqRows = stateSequences.map((sequenceItem, index) => [
    'Seq',
    ...Array(ecpHeader.length + synHeader.length).fill(''),
    'Sequence',
    sequenceItem.seqCaseID || '',
    sequenceItem.sequence.join(' → '),
    '',
    `${(((index + 1) / totalSeqForCombined) * 100).toFixed(2)}%`
  ]);

  const combinedRows = [
    ...ecpRows.map(row => ['ECP', ...row, ...Array(synHeader.length).fill(''), '', '', '', '', '']),
    ...synRows.map(row => ['Syntax', ...Array(ecpHeader.length).fill(''), ...row, '', '', '', '', '']),
    ...combinedStateRows,
    ...combinedSeqRows
  ];
  const combinedCsvData = stringify([combinedHeader, ...combinedRows]);

  // 7) Return everything
  return {
    partitions,
    testCases,
    syntaxResults,
    stateTests,
    stateSequences,
    stateTreeNodes: _stateTreeNodes,
    stateTreeLinks: _stateTreeLinks,
    ecpCsvData,
    syntaxCsvData,
    stateCsvData,
    stateSeqCsvData,
    combinedCsvData
  };
};
