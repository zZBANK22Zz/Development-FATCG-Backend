const pool = require('../config/database');

const UserModel = {
    //Find user by email
    findByEmail: async (email) => {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await pool.query(query, [email]);
        return result.rows[0];
    },

    //Find user by username
    findByUsername: async (username) =>{
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await pool.query(query, [username]);
        return result.rows[0];
    },

    //Create new user
    createUser: async (username, email, hashedPassword) => {
        const query = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *';
        const result = await pool.query(query, [username, email, hashedPassword]);
        return result.rows[0];
    }
}

module.exports = UserModel;