const express = require("express");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const router = express.Router();
const { generateFTATests } = require("../controller/ftaController");
const authMiddleware = require("../middleware/auth.middleware");

// Optional authentication middleware - allows requests with or without token
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // If token is provided, use auth middleware
    return authMiddleware(req, res, next);
  }
  // If no token, continue without authentication
  next();
};

router.post("/generate", optionalAuth, upload.single("xmlFile"), generateFTATests);

module.exports = router;


