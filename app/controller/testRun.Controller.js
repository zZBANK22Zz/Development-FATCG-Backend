// controllers/testRunController.js
const ExcelJS = require('exceljs');
const TestRun = require('../model/TestRun.Model');
const { generateAll } = require('../services/testGen.Service');
// const { buildGraphFromStateTests, buildSequenceDiagramFromSequences } = require('../services/mappers/diagramMapper');

// POST /api/runs
exports.createTestRun = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing user id' });
    }
    // 1) grab buffers from multer.memoryStorage()
    const dataDictionaryBuffer = req.files.dataDictionary[0].buffer;
    const decisionTreeBuffer = req.files.decisionTree[0].buffer;
    const stateMachineBuffer = req.files.stateMachine?.[0]?.buffer; // optional

    // original filenames for metadata
    const dataDictionaryFilename = req.files.dataDictionary[0].originalname;
    const decisionTreeFilename = req.files.decisionTree[0].originalname;
    const stateMachineFilename = req.files.stateMachine?.[0]?.originalname || null;

    // 2) generate everything (✅ use stateTests/stateSequences)
    const {
      partitions,
      testCases,
      syntaxResults,
      stateTests,        // ✅ new single array of 5-col rows
      stateSequences,    // ✅ sequences
      stateTreeNodes,    // ✅ unfolded tree nodes
      stateTreeLinks,    // ✅ unfolded tree links
      ecpCsvData,
      syntaxCsvData,
      stateCsvData,
      stateSeqCsvData,
      combinedCsvData
    } = await generateAll(dataDictionaryBuffer, decisionTreeBuffer, stateMachineBuffer);

    // 3) persist to Mongo (✅ store stateTests directly)
    const created = await TestRun.create(req.user.id, {
      dataDictionaryFilename,
      decisionTreeFilename,
      stateTransitionFilename: stateMachineFilename,
      partitions,
      testCases,
      syntaxResults,
      stateTests,
      stateSequences,
      stateTreeNodes,
      stateTreeLinks,
      ecpCsvData,
      syntaxCsvData,
      stateCsvData,
      stateSeqCsvData,
      combinedCsvData
    });

    // Build GoJS model data via mappers
    const parseFromTo = (row) => {
      if (row.transitionDescription) {
        const td = String(row.transitionDescription);
        if (td.includes('→')) {
          const [from, to] = td.split('→').map(s => s.trim());
          return { from, to };
        }
        if (td.includes('-->')) {
          const [from, to] = td.split('-->').map(s => s.trim());
          return { from, to };
        }
      }
      return { from: (row.startState || '').trim(), to: (row.expectedState || '').trim() };
    };

    const nodeSet = new Set();
    (stateTests || []).forEach(t => {
      const { from, to } = parseFromTo(t);
      if (from) nodeSet.add(from);
      if (to) nodeSet.add(to);
    });
    const nodes = Array.from(nodeSet).map(key => ({ key }));
    const links = (stateTests || [])
      .filter(t => t.type === 'Valid')
      .map(t => {
        const { from, to } = parseFromTo(t);
        return { from, to, text: '' };
      });

    // 5) return metadata + URLs + diagram data
    const base = `${req.protocol}://${req.get('host')}/api/runs/${created.id}`;
    return res.json({
      success: true,
      runId: created.id,
      partitions,
      testCases,
      syntaxResults,
      stateTests,                 // ✅ primary
      // Deprecated compatibility fields can be derived outside if needed
      // stateValid / stateInvalid removed in favor of stateTests
      stateSequences,
      nodes,
      links,
      // New: Unfolded state tree with event labels
      stateTreeNodes,
      stateTreeLinks,
      ecpCsvUrl: `${base}/ecp-csv`,
      syntaxCsvUrl: `${base}/syntax-csv`,
      stateCsvUrl: `${base}/state-csv`,
      // if you expose a separate sequences CSV endpoint, add it here:
      // stateSeqCsvUrl: `${base}/state-seq-csv`,
      combinedCsvUrl: `${base}/csv`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};


// GET /api/runs
exports.listTestRuns = async (req, res) => {
  try {
    const rows = await TestRun.findByUserId(req.user.id);
    const runs = rows.map(r => ({
      _id: r.id,
      dataDictionaryFilename: r.data_dictionary_filename,
      decisionTreeFilename: r.decision_tree_filename,
      stateTransitionFilename: r.state_transition_filename,
      createdAt: r.created_at
    }));
    return res.json({ success: true, runs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};



// GET /api/runs/:id
exports.getTestRun = async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id);

    if (!run) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    // Unified accessor (handles new rows with transitionDescription and old rows with startState/expectedState)
    const stateTests = run.stateTests || [];

    // Helper to extract from/to for any row
    const parseFromTo = (row) => {
      if (row.transitionDescription) {
        const td = String(row.transitionDescription);
        if (td.includes('→')) {
          const [from, to] = td.split('→').map(s => s.trim());
          return { from, to };
        }
        if (td.includes('-->')) {
          const [from, to] = td.split('-->').map(s => s.trim());
          return { from, to };
        }
      }
      // Fallback (older data)
      const from = (row.startState || '').trim();
      const to = (row.expectedState || '').trim();
      return { from, to };
    };

    // Build nodes & links from VALID rows only
    const stateValidArr = stateTests.filter(t => t.type === 'Valid');
    const stateInvalidArr = stateTests.filter(t => t.type === 'Invalid');

    const nodeSet = new Set();
    stateTests.forEach(t => {
      const { from, to } = parseFromTo(t);
      if (from) nodeSet.add(from);
      if (to) nodeSet.add(to);
    });
    const nodes = Array.from(nodeSet).map(key => ({ key }));

    const links = stateValidArr.map(t => {
      const { from, to } = parseFromTo(t);
      return { from, to, text: '' }; // no event in the new matrix shape
    });

    // Respond
    const base = `${req.protocol}://${req.get('host')}/api/runs/${run.id}`;
    return res.json({
      success: true,
      dataDictionaryFilename: run.data_dictionary_filename,
      decisionTreeFilename: run.decision_tree_filename,
      stateTransitionFilename: run.state_transition_filename,
      partitions: run.partitions,
      testCases: run.testCases,
      syntaxResults: run.syntaxResults,

      // New primary arrays
      stateTests,              // merged single-transition rows (Valid + Invalid)
      stateValid: stateValidArr,
      stateInvalid: stateInvalidArr,
      stateSequences: run.stateSequences || [],

      // Diagram data
      nodes,
      links,
      // Tree-friendly, sequence-expanded nodes/links
      seqNodes: (() => {
        const seqNodeMap = new Map();
        (run.stateSequences || []).forEach(s => {
          const path = Array.isArray(s.sequence) ? s.sequence : [];
          for (let i = 0; i < path.length; i++) {
            const state = path[i];
            const key = `${s.seqCaseID}:${String(i).padStart(2, '0')}:${state}`;
            if (!seqNodeMap.has(key)) seqNodeMap.set(key, { key, label: state });
          }
        });
        return Array.from(seqNodeMap.values());
      })(),
      seqLinks: (() => {
        const links = [];
        (run.stateSequences || []).forEach(s => {
          const path = Array.isArray(s.sequence) ? s.sequence : [];
          for (let i = 1; i < path.length; i++) {
            const prevKey = `${s.seqCaseID}:${String(i - 1).padStart(2, '0')}:${path[i - 1]}`;
            const key = `${s.seqCaseID}:${String(i).padStart(2, '0')}:${path[i]}`;
            links.push({ from: prevKey, to: key, text: '' });
          }
        });
        return links;
      })(),
      // New: persisted unfolded state tree (preferred for diagram)
      stateTreeNodes: run.state_tree_nodes || [],
      stateTreeLinks: run.state_tree_links || [],

      // Download URLs
      ecpCsvUrl: `${base}/ecp-csv`,
      syntaxCsvUrl: `${base}/syntax-csv`,
      stateCsvUrl: `${base}/state-csv`,
      combinedCsvUrl: `${base}/csv`
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
};



// GET /api/runs/:id/ecp-csv
exports.downloadEcpCsv = async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id);
    if (!run) return res.status(404).send('Not found');
    res.header('Content-Type', 'text/csv');
    res.attachment(`ecp-${run.id}.csv`);
    res.send(run.ecp_csv_data || run.ecpCsvData);
  } catch {
    res.status(500).send('Server error');
  }
};

// GET /api/runs/:id/syntax-csv
exports.downloadSyntaxCsv = async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id);
    if (!run) return res.status(404).send('Not found');
    res.header('Content-Type', 'text/csv');
    res.attachment(`syntax-${run.id}.csv`);
    res.send(run.syntax_csv_data || run.syntaxCsvData);
  } catch {
    res.status(500).send('Server error');
  }
};

// GET /api/runs/:id/state-csv  → Excel workbook with two sheets
exports.downloadStateCsv = async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id);
    if (!run) return res.status(404).send('Not found');

    const wb = new ExcelJS.Workbook();

    // ---- Sheet 1: Single-Step State Tests ----
    const stateSingleSheet = wb.addWorksheet('State Single-Step');
    stateSingleSheet.columns = [
      { header: 'Test Case ID', key: 'testCaseID' },
      { header: 'Type', key: 'type' },
      { header: 'Start State', key: 'startState' },
      { header: 'Transition Description', key: 'transitionDescription' },
      { header: 'Expected State', key: 'expectedState' },
      { header: 'Coverage (%)', key: 'coverage', style: { numFmt: '0.00%' } }
    ];

    const stateTests = (run.stateTests || []);
    const stateValid = stateTests.filter(tc => tc.type === 'Valid');
    const stateInvalid = stateTests.filter(tc => tc.type === 'Invalid');

    const attemptDest = (tc) => tc.attemptedState || tc.expectedState || '';

    let counter = 1;
    const totalSingles = Math.max(stateTests.length, 1);

    // Valid rows
    stateValid.forEach(tc => {
      const id = `TC${String(counter).padStart(3, '0')}`;
      stateSingleSheet.addRow({
        type: 'Valid',
        testCaseID: id,
        startState: tc.startState,
        transitionDescription: tc.transitionDescription || `${tc.startState} → ${tc.expectedState}`,
        expectedState: tc.expectedState,
        coverage: counter / totalSingles
      });
      counter++;
    });

    // Invalid rows (expected = attempted destination)
    stateInvalid.forEach(tc => {
      const id = `TC${String(counter).padStart(3, '0')}`;
      const to = attemptDest(tc);
      stateSingleSheet.addRow({
        type: 'Invalid',
        testCaseID: id,
        startState: tc.startState,
        transitionDescription: tc.transitionDescription || `${tc.startState} → ${to}`,
        expectedState: to,
        coverage: counter / totalSingles
      });
      counter++;
    });


    // ---- Sheet 2: Sequence State Tests ----
    const stateSeqSheet = wb.addWorksheet('State Sequences');
    stateSeqSheet.columns = [
      { header: 'Test Case ID', key: 'testCaseID' },
      { header: 'Sequence of Transitions', key: 'sequence' },
      { header: 'Coverage (%)', key: 'coverage', style: { numFmt: '0.00%' } }
    ];

    let seqCounter = 1;
    const totalSeq = Math.max((run.stateSequences || []).length, 1);
    (run.stateSequences || []).forEach(s => {
      const id = `TC${String(seqCounter).padStart(3, '0')}`;
      stateSeqSheet.addRow({
        testCaseID: id,
        sequence: Array.isArray(s.sequence) ? s.sequence.join(' → ') : '',
        coverage: seqCounter / totalSeq
      });
      seqCounter++;
    });

    // stream workbook
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="state-${run.id}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// GET /api/runs/:id/csv  → combined Excel workbook with ECP, Syntax, State Single-Step, State Sequences
exports.downloadCombined = async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id);
    if (!run) return res.status(404).send('Not found');

    const wb = new ExcelJS.Workbook();

    // ECP sheet
    const ecpSheet = wb.addWorksheet('ECP Test Cases');
    const ecpInputKeys = run.testCases.length ? Object.keys(run.testCases[0].inputs) : [];
    const ecpExpectedKeys = run.testCases.length ? Object.keys(run.testCases[0].expected) : [];
    ecpSheet.columns = [
      { header: 'Test Case ID', key: 'testCaseID' },
      { header: 'Type', key: 'type' },
      ...ecpInputKeys.map(k => ({ header: k, key: k })),
      ...ecpExpectedKeys.map(k => ({ header: k, key: `exp_${k}` })),
      { header: 'Coverage (%)', key: 'coverage', style: { numFmt: '0.00%' } }
    ];
    const totalEcp = Math.max(run.testCases.length, 1);
    run.testCases.forEach((tc, idx) => {
      const row = { testCaseID: tc.testCaseID, type: tc.type || 'Valid', coverage: (idx + 1) / totalEcp };
      ecpInputKeys.forEach(k => row[k] = tc.inputs[k]);
      ecpExpectedKeys.forEach(k => row[`exp_${k}`] = tc.expected[k]);
      ecpSheet.addRow(row);
    });

    // Syntax sheet
    const syntaxSheet = wb.addWorksheet('Syntax Test Cases');
    syntaxSheet.columns = [
      { header: 'Name', key: 'name' },
      { header: 'Valid', key: 'valid' },
      { header: 'Invalid Value', key: 'invalidValue' },
      { header: 'Invalid Omission', key: 'invalidOmission' },
      { header: 'Invalid Addition', key: 'invalidAddition' },
      { header: 'Invalid Substitution', key: 'invalidSubstitution' }
    ];
    run.syntaxResults.forEach(sr => {
      syntaxSheet.addRow({
        name: sr.name,
        valid: sr.testCases.valid,
        invalidValue: sr.testCases.invalidValue,
        invalidOmission: sr.testCases.invalidOmission,
        invalidAddition: sr.testCases.invalidAddition,
        invalidSubstitution: sr.testCases.invalidSubstitution
      });
    });

    // ---- State Single-Step sheet ----
    const stateSingleSheet = wb.addWorksheet('State Test Cases');
    stateSingleSheet.columns = [
      { header: 'Test Case ID', key: 'testCaseID' },
      { header: 'Type', key: 'type' },
      { header: 'Start State', key: 'startState' },
      { header: 'Transition Description', key: 'transitionDescription' },
      { header: 'Expected State', key: 'expectedState' },
      { header: 'Coverage (%)', key: 'coverage', style: { numFmt: '0.00%' } }
    ];

    const stateTests = (run.stateTests || []);
    const stateValid = stateTests.filter(tc => tc.type === 'Valid');
    const stateInvalid = stateTests.filter(tc => tc.type === 'Invalid');
    const attemptDest = (tc) => tc.attemptedState || tc.expectedState || '';

    let counter = 1;
    const totalSingles = Math.max(stateTests.length, 1);

    // Valid rows
    stateValid.forEach(tc => {
      const id = `TC${String(counter).padStart(3, '0')}`;
      stateSingleSheet.addRow({
        type: 'Valid',
        testCaseID: id,
        startState: tc.startState,
        transitionDescription: tc.transitionDescription || `${tc.startState} → ${tc.expectedState}`,
        expectedState: tc.expectedState,
        coverage: counter / totalSingles
      });
      counter++;
    });

    // Invalid rows
    stateInvalid.forEach(tc => {
      const id = `TC${String(counter).padStart(3, '0')}`;
      const to = attemptDest(tc);
      stateSingleSheet.addRow({
        type: 'Invalid',
        testCaseID: id,
        startState: tc.startState,
        transitionDescription: tc.transitionDescription || `${tc.startState} → ${to}`,
        expectedState: to,
        coverage: counter / totalSingles
      });
      counter++;
    });


    // ---- State Sequences sheet ----
    const stateSeqSheet = wb.addWorksheet('State Sequences');
    stateSeqSheet.columns = [
      { header: 'Test Case ID', key: 'testCaseID' },
      { header: 'Sequence of Transitions', key: 'sequence' },
      { header: 'Coverage (%)', key: 'coverage', style: { numFmt: '0.00%' } }
    ];

    let seqCounter = 1;
    const totalSeq = Math.max((run.stateSequences || []).length, 1);
    (run.stateSequences || []).forEach(s => {
      const id = `TC${String(seqCounter).padStart(3, '0')}`;
      stateSeqSheet.addRow({
        testCaseID: id,
        sequence: Array.isArray(s.sequence) ? s.sequence.join(' → ') : '',
        coverage: seqCounter / totalSeq
      });
      seqCounter++;
    });

    // stream workbook
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="testRun-${run.id}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};


