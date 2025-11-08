const express = require("express");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const router = express.Router();
const { generateFTATests } = require("../controller/ftaController");

// Placeholder routes for FTA (none defined yet)
router.post("/generate", upload.single("xmlFile"), generateFTATests);

module.exports = router;


