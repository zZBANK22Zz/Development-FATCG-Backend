const multer = require('multer');
const path = require('path');

// Configure storage for uploaded files
const storage = multer.memoryStorage(); // stores uploaded files in RAM

module.exports = multer({ storage });