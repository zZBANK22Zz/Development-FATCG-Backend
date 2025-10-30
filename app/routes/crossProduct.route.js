const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const {
  generateCrossProduct,
  generateCrossProductCsv
} = require('../controller/crossProduct.Controller');
const validateCrossProductXml = require('../utils/xmlValidatorCrossProduct');

// All cross-product routes require authentication
router.use(authMiddleware);

/**
 * POST /api/crossproduct
 * Generate cross-product ECP test cases
 * 
 * Files:
 * - dataDictionary: XML file (required)
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     validCases: [...],
 *     invalidCases: [...],
 *     totalValidCases: number,
 *     totalInvalidCases: number,
 *     totalCases: number,
 *     crossCsv: string,
 *     embedded: boolean
 *   }
 * }
 */
router.post(
  '/',
  upload.fields([
    { name: 'dataDictionary', maxCount: 1 }
  ]),
  validateCrossProductXml,
  generateCrossProduct
);

/**
 * POST /api/crossproduct/csv
 * Generate cross-product and return CSV file
 * 
 * Files:
 * - dataDictionary: XML file (required)
 * 
 * Response: CSV file download
 */
router.post(
  '/csv',
  upload.fields([
    { name: 'dataDictionary', maxCount: 1 }
  ]),
  validateCrossProductXml,
  generateCrossProductCsv
);

module.exports = router;

