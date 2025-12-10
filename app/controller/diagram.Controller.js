const Diagram = require('../model/Diagram.Model');

// POST /api/diagrams - Create a new diagram
exports.createDiagram = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const created = await Diagram.create(req.user.id, {
      name: req.body.name,
      description: req.body.description,
      xmlData: req.body.xmlData,
      jsonData: req.body.jsonData,
      diagramType: req.body.diagramType || 'FTA'
    });

    return res.status(201).json({
      success: true,
      diagram: {
        id: created.id,
        name: req.body.name,
        description: req.body.description,
        diagramType: req.body.diagramType || 'FTA',
        createdAt: created.created_at,
        updatedAt: created.updated_at
      }
    });
  } catch (error) {
    console.error('Error creating diagram:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/diagrams - Get all diagrams for current user
exports.getAllDiagrams = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const diagrams = await Diagram.findByUserId(req.user.id);
    
    return res.json({
      success: true,
      diagrams: diagrams.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        diagramType: d.diagram_type,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching diagrams:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/diagrams/:id - Get a specific diagram
exports.getDiagram = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const diagram = await Diagram.findById(req.params.id);
    
    if (!diagram) {
      return res.status(404).json({ success: false, error: 'Diagram not found' });
    }

    if (diagram.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return res.json({
      success: true,
      diagram: {
        id: diagram.id,
        name: diagram.name,
        description: diagram.description,
        xmlData: diagram.xml_data,
        jsonData: typeof diagram.json_data === 'string' ? JSON.parse(diagram.json_data) : diagram.json_data,
        diagramType: diagram.diagram_type,
        createdAt: diagram.created_at,
        updatedAt: diagram.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching diagram:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/diagrams/:id - Update a diagram
exports.updateDiagram = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const diagram = await Diagram.findById(req.params.id);
    
    if (!diagram) {
      return res.status(404).json({ success: false, error: 'Diagram not found' });
    }

    if (diagram.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await Diagram.update(req.params.id, {
      name: req.body.name,
      description: req.body.description,
      xmlData: req.body.xmlData,
      jsonData: req.body.jsonData
    });

    return res.json({
      success: true,
      message: 'Diagram updated successfully',
      updatedAt: updated.updated_at
    });
  } catch (error) {
    console.error('Error updating diagram:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/diagrams/:id - Delete a diagram
exports.deleteDiagram = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const diagram = await Diagram.findById(req.params.id);
    
    if (!diagram) {
      return res.status(404).json({ success: false, error: 'Diagram not found' });
    }

    if (diagram.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await Diagram.delete(req.params.id);

    return res.json({
      success: true,
      message: 'Diagram deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting diagram:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

