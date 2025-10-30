const pool = require('../config/database');

const DiagramModel = {
  // Create a new diagram
  create: async (userId, data) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO diagrams (
          user_id,
          name,
          description,
          xml_data,
          json_data,
          diagram_type
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, updated_at
      `;

      const result = await client.query(query, [
        userId,
        data.name || 'Untitled Diagram',
        data.description || '',
        data.xmlData || '',
        JSON.stringify(data.jsonData || {}),
        data.diagramType || 'FTA'
      ]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Get diagram by ID
  findById: async (id) => {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id, user_id, name, description, xml_data, json_data, 
          diagram_type, created_at, updated_at
        FROM diagrams
        WHERE id = $1
      `;
      
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  },

  // Get all diagrams for a user
  findByUserId: async (userId) => {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id, user_id, name, description, diagram_type, 
          created_at, updated_at
        FROM diagrams
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `;
      
      const result = await client.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  },

  // Update diagram
  update: async (id, data) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        UPDATE diagrams
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          xml_data = COALESCE($3, xml_data),
          json_data = COALESCE($4, json_data),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING id, created_at, updated_at
      `;

      const result = await client.query(query, [
        data.name || null,
        data.description || null,
        data.xmlData || null,
        JSON.stringify(data.jsonData || {}),
        id
      ]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Delete diagram
  delete: async (id) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const query = `DELETE FROM diagrams WHERE id = $1 RETURNING id`;
      const result = await client.query(query, [id]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

module.exports = DiagramModel;

