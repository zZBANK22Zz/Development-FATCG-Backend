const express = require('express')
const app = express()
const PORT = 8000
const cors = require('cors')
app.use(cors())

const ecpRoutes = require('./app/routes/ecp.routes');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/ecp', ecpRoutes);

app.get('/', (req, res)=>{
    res.send(`App running on port${PORT}`);
});

app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
})