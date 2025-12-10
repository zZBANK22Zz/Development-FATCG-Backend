const pool = require('../config/database');

const TestRunModel = {
  // Create a new test run
  create: async (userId, data) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert main test_run
      const testRunQuery = `
        INSERT INTO test_runs (
          user_id, 
          data_dictionary_filename,
          decision_tree_filename,
          state_transition_filename,
          ecp_csv_data,
          syntax_csv_data,
          state_csv_data,
          state_seq_csv_data,
          combined_csv_data,
          state_tree_nodes,
          state_tree_links
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at
      `;

      const testRunResult = await client.query(testRunQuery, [
        userId,
        data.dataDictionaryFilename || null,
        data.decisionTreeFilename || null,
        data.stateTransitionFilename || null,
        data.ecpCsvData,
        data.syntaxCsvData,
        data.stateCsvData || '',
        data.stateSeqCsvData || '',
        data.combinedCsvData,
        JSON.stringify(data.stateTreeNodes || []),
        JSON.stringify(data.stateTreeLinks || [])
      ]);

      const testRunId = testRunResult.rows[0].id;

      // Insert partitions
      if (data.partitions && data.partitions.length > 0) {
        for (const partition of data.partitions) {
          const partitionQuery = `
            INSERT INTO partitions (test_run_id, name)
            VALUES ($1, $2)
            RETURNING id
          `;
          const partitionResult = await client.query(partitionQuery, [
            testRunId,
            partition.name
          ]);

          const partitionId = partitionResult.rows[0].id;

          // Insert partition items
          if (partition.items && partition.items.length > 0) {
            for (const item of partition.items) {
              const itemQuery = `
                INSERT INTO partition_items (partition_id, item_id, label, sample)
                VALUES ($1, $2, $3, $4)
              `;
              await client.query(itemQuery, [
                partitionId,
                item.id,
                item.label,
                JSON.stringify(item.sample)
              ]);
            }
          }
        }
      }

      // Insert test cases
      if (data.testCases && data.testCases.length > 0) {
        const testCaseQuery = `
          INSERT INTO test_cases (test_run_id, test_case_id, type, inputs, expected)
          VALUES ($1, $2, $3, $4, $5)
        `;
        for (const tc of data.testCases) {
          await client.query(testCaseQuery, [
            testRunId,
            tc.testCaseID,
            tc.type || null,
            JSON.stringify(tc.inputs),
            JSON.stringify(tc.expected)
          ]);
        }
      }

      // Insert syntax results
      if (data.syntaxResults && data.syntaxResults.length > 0) {
        const syntaxQuery = `
          INSERT INTO syntax_results (
            test_run_id, name, description, regex, type, length, test_cases
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        for (const syntax of data.syntaxResults) {
          await client.query(syntaxQuery, [
            testRunId,
            syntax.name,
            syntax.description,
            syntax.regex,
            syntax.type,
            syntax.length,
            JSON.stringify(syntax.testCases || {})
          ]);
        }
      }

      // Insert state tests
      if (data.stateTests && data.stateTests.length > 0) {
        const stateTestQuery = `
          INSERT INTO state_tests (
            test_run_id, test_case_id, start_state, event, expected_state, type
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        for (const st of data.stateTests) {
          await client.query(stateTestQuery, [
            testRunId,
            st.testCaseID,
            st.startState,
            st.event,
            JSON.stringify(st.expectedState),
            st.type
          ]);
        }
      }

      // Insert state sequences
      if (data.stateSequences && data.stateSequences.length > 0) {
        const seqQuery = `
          INSERT INTO state_sequences (test_run_id, seq_case_id, sequence)
          VALUES ($1, $2, $3)
        `;
        for (const seq of data.stateSequences) {
          await client.query(seqQuery, [
            testRunId,
            seq.seqCaseID,
            JSON.stringify(seq.sequence)
          ]);
        }
      }

      await client.query('COMMIT');
      return { id: testRunId, ...testRunResult.rows[0] };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Get test run by ID with all related data
  findById: async (testRunId) => {
    const testRunQuery = `
      SELECT * FROM test_runs WHERE id = $1
    `;
    const testRun = await pool.query(testRunQuery, [testRunId]);

    if (testRun.rows.length === 0) {
      return null;
    }

    const data = testRun.rows[0];

    // Get partitions with items
    const partitionsQuery = `
      SELECT p.id, p.name,
             json_agg(
               json_build_object(
                 'id', pi.item_id,
                 'label', pi.label,
                 'sample', pi.sample
               )
             ) FILTER (WHERE pi.id IS NOT NULL) as items
      FROM partitions p
      LEFT JOIN partition_items pi ON p.id = pi.partition_id
      WHERE p.test_run_id = $1
      GROUP BY p.id, p.name
    `;
    const partitions = await pool.query(partitionsQuery, [testRunId]);

    // Get test cases
    const testCasesQuery = `
      SELECT test_case_id, type, inputs, expected
      FROM test_cases
      WHERE test_run_id = $1
    `;
    const testCases = await pool.query(testCasesQuery, [testRunId]);

    // Get syntax results
    const syntaxQuery = `
      SELECT * FROM syntax_results WHERE test_run_id = $1
    `;
    const syntaxResults = await pool.query(syntaxQuery, [testRunId]);

    // Get state tests
    const stateTestsQuery = `
      SELECT * FROM state_tests WHERE test_run_id = $1
    `;
    const stateTests = await pool.query(stateTestsQuery, [testRunId]);

    // Get state sequences
    const stateSeqQuery = `
      SELECT * FROM state_sequences WHERE test_run_id = $1
    `;
    const stateSequences = await pool.query(stateSeqQuery, [testRunId]);

    return {
      ...data,
      partitions: partitions.rows,
      testCases: testCases.rows,
      syntaxResults: syntaxResults.rows,
      stateTests: stateTests.rows,
      stateSequences: stateSequences.rows
    };
  },

  // Get all test runs by user
  findByUserId: async (userId, limit = 10, offset = 0) => {
    const query = `
      SELECT id, created_at, 
             data_dictionary_filename,
             decision_tree_filename,
             state_transition_filename
      FROM test_runs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  },

  // Delete test run
  delete: async (testRunId) => {
    const query = `DELETE FROM test_runs WHERE id = $1 RETURNING id`;
    const result = await pool.query(query, [testRunId]);
    return result.rows[0];
  },

  // Save CCTM classification tree structure
  saveCctmTreeStructure: async (userId, treeStructure) => {
    // ใช้ state_tree_nodes column เพื่อเก็บ tree structure ชั่วคราว
    // หรืออาจจะเพิ่ม column ใหม่ในอนาคต
    const query = `
      INSERT INTO test_runs (
        user_id,
        data_dictionary_filename,
        state_tree_nodes,
        ecp_csv_data,
        combined_csv_data
      ) VALUES ($1, $2, $3, '', '')
      RETURNING id, created_at
    `;
    const result = await pool.query(query, [
      userId,
      'cctm-tree-structure',
      JSON.stringify(treeStructure)
    ]);
    return result.rows[0];
  },

  // Get latest CCTM tree structure for user
  getLatestCctmTreeStructure: async (userId) => {
    const query = `
      SELECT state_tree_nodes, id, created_at
      FROM test_runs
      WHERE user_id = $1 
        AND data_dictionary_filename = 'cctm-tree-structure'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      createdAt: row.created_at,
      treeStructure: row.state_tree_nodes ? JSON.parse(row.state_tree_nodes) : null
    };
  },

  // Update existing test run with CCTM tree structure
  updateCctmTreeStructure: async (testRunId, treeStructure) => {
    const query = `
      UPDATE test_runs
      SET state_tree_nodes = $1
      WHERE id = $2
      RETURNING id
    `;
    const result = await pool.query(query, [JSON.stringify(treeStructure), testRunId]);
    return result.rows[0];
  }
};

module.exports = TestRunModel;