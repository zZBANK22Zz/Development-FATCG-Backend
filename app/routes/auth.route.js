const express = require('express');
const router = express.Router();
const AuthController = require('../controller/auth.controller');

// Register route
router.post('/register', AuthController.register);

// Login route
router.post('/login', AuthController.login);

module.exports = router;