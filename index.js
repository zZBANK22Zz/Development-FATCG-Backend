const express = require('express')
const app = express()
const PORT = 8000
const cors = require('cors')
app.use(cors())
require('dotenv').config();
const pool = require('./app/config/database');
const authRoutes = require('./app/routes/auth.route');


//Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res)=>{
    res.send(`App running on port${PORT}`);
});

pool.connect()
    .then(() => console.log('Connected to the database'))
    .catch((err) => console.error('Database connection error', err.stack));

app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
})