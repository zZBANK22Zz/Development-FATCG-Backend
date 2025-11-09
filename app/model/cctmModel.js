const pool = require('../config/database');

const CctmModel = {
    // Save CCTM test cases for a system (1 system = 1 row, all test cases in test_cases column)
    saveCctmSystem: async (userId, systemName, testCases, metadata = {}) => {
        // Check if system already exists for this user
        const existingSystem = await pool.query(
            'SELECT * FROM cctm_testcase WHERE user_id = $1 AND system_name = $2',
            [userId, systemName]
        );
        
        // Prepare test cases data structure
        const testCasesData = {
            total: testCases.length,
            validCount: testCases.filter(tc => tc.type === 'Valid' || tc.type === 'valid').length,
            invalidCount: testCases.filter(tc => tc.type === 'Invalid' || tc.type === 'invalid').length,
            testCases: testCases.map(tc => ({
                id: tc.id,
                type: tc.type,
                inputs: tc.inputs
            })),
            ...metadata // Include additional metadata like variables, useCaseInfo, etc.
        };
        
        if (existingSystem.rows.length > 0) {
            // Update existing system
            const updateSystem = await pool.query(
                `UPDATE cctm_testcase 
                 SET test_cases = $1, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE user_id = $2 AND system_name = $3 
                 RETURNING *`,
                [testCasesData, userId, systemName]
            );
            return updateSystem.rows[0];
        } else {
            // Create new system
            const newSystem = await pool.query(
                `INSERT INTO cctm_testcase 
                 (user_id, system_name, test_cases, created_at, updated_at) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
                 RETURNING *`,
                [userId, systemName, testCasesData]
            );
            return newSystem.rows[0];
        }
    },

    // Get all CCTM systems by user_id
    getCctmSystemsByUserId: async (userId) => {
        const result = await pool.query(
            'SELECT * FROM cctm_testcase WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    },

    // Get a single system by user_id and system_name
    getCctmSystemByName: async (userId, systemName) => {
        const result = await pool.query(
            'SELECT * FROM cctm_testcase WHERE user_id = $1 AND system_name = $2',
            [userId, systemName]
        );
        return result.rows[0];
    },

    // Get a single system by id
    getCctmSystemById: async (id) => {
        const result = await pool.query(
            'SELECT * FROM cctm_testcase WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Delete a system by user_id and system_name
    deleteCctmSystem: async (userId, systemName) => {
        const result = await pool.query(
            'DELETE FROM cctm_testcase WHERE user_id = $1 AND system_name = $2 RETURNING *',
            [userId, systemName]
        );
        return result.rows[0];
    },

    // Delete a system by id
    deleteCctmSystemById: async (id) => {
        const result = await pool.query(
            'DELETE FROM cctm_testcase WHERE id = $1 RETURNING *',
            [id]
        );
        return result.rows[0];
    },

    // Delete all systems for a user
    deleteAllCctmSystemsByUserId: async (userId) => {
        const result = await pool.query(
            'DELETE FROM cctm_testcase WHERE user_id = $1 RETURNING *',
            [userId]
        );
        return result.rows;
    }
}

module.exports = CctmModel;