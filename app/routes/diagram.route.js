const express = require('express');
const router = express.Router();
const diagramController = require('../controller/diagram.Controller');
const auth = require('../middleware/auth.middleware');

// All diagram routes require authentication
router.use(auth);

// POST /api/diagrams - Create a new diagram
router.post('/', diagramController.createDiagram);

// GET /api/diagrams - Get all user's diagrams
router.get('/', diagramController.getAllDiagrams);

// GET /api/diagrams/:id - Get a specific diagram
router.get('/:id', diagramController.getDiagram);

// PUT /api/diagrams/:id - Update a diagram
router.put('/:id', diagramController.updateDiagram);

// DELETE /api/diagrams/:id - Delete a diagram
router.delete('/:id', diagramController.deleteDiagram);

module.exports = router;

