const express = require('express')
const app = express()
const PORT = 8000
const cors = require('cors')
app.use(cors())
require('dotenv').config();
const pool = require('./app/config/database');


const authRoutes = require('./app/routes/auth.route');
const testRunRoutes = require('./app/routes/testRun.route');
const diagramRoutes = require('./app/routes/diagram.route');
const crossProductRoutes = require('./app/routes/crossProduct.route');
const cctmRoutes = require('./app/routes/cctm.route');
//Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Routes
app.use('/api/auth', authRoutes);
app.use('/api/testruns', testRunRoutes);
app.use('/api/diagrams', diagramRoutes);
app.use('/api/crossproduct', crossProductRoutes);
app.use('/api/cctm', cctmRoutes);
app.get('/', (req, res)=>{
    res.send(`App running on port${PORT}`);
});

pool.connect()
    .then(() => console.log('Connected to the database'))
    .catch((err) => console.error('Database connection error', err.stack));

app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
})