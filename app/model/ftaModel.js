const pool = require('../config/database');

const FtaModel = {
    // Save FTA to database with all required fields
    saveFta: async (userId, ftaData, faultPatternType, systemName, testCaseName) => {
        // Check existing FTA data by user_id and test_case_name
        const existingFta = await pool.query(
            'SELECT * FROM fta_testcase WHERE user_id = $1 AND test_case_name = $2',
            [userId, testCaseName]
        );
        
        if (existingFta.rows.length > 0) {
            // Update existing FTA data
            const updateFta = await pool.query(
                `UPDATE fta_testcase 
                 SET fault_pattern_type = $1, 
                     system_name = $2, 
                     test_case_data = $3, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE user_id = $4 AND test_case_name = $5 
                 RETURNING *`,
                [faultPatternType, systemName, ftaData, userId, testCaseName]
            );
            return updateFta.rows[0];
        } else {
            // Create new FTA data
            const newFta = await pool.query(
                `INSERT INTO fta_testcase 
                 (user_id, fault_pattern_type, system_name, test_case_name, test_case_data, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
                 RETURNING *`,
                [userId, faultPatternType, systemName, testCaseName, ftaData]
            );
            return newFta.rows[0];
        }
    },

    // Get FTA data by user_id
    getFtaByUserId: async (userId) => {
        const result = await pool.query(
            'SELECT * FROM fta_testcase WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    },

    // Get FTA data by id
    getFtaById: async (id) => {
        const result = await pool.query(
            'SELECT * FROM fta_testcase WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Get FTA data by user_id and system_name
    getFtaBySystemName: async (userId, systemName) => {
        const result = await pool.query(
            'SELECT * FROM fta_testcase WHERE user_id = $1 AND system_name = $2 ORDER BY created_at DESC',
            [userId, systemName]
        );
        return result.rows;
    },

    // Delete FTA data by id
    deleteFta: async (id, userId) => {
        const result = await pool.query(
            'DELETE FROM fta_testcase WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );
        return result.rows[0];
    }
}

module.exports = FtaModel;