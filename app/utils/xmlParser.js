// backend/utils/xmlParser.js
const fs = require('fs');
const { parseStringPromise } = require('xml2js');

/**
 * Parse XML from either:
 *   • a filesystem path (string), or
 *   • an in-memory Buffer (e.g. from multer.memoryStorage())
 *
 * @param {Buffer|string} input
 * @returns {Promise<object>}
 */
async function parseXMLFile(input) {
  let xmlText;

  if (Buffer.isBuffer(input)) {
    // Buffer from multer
    xmlText = input.toString('utf8');
  } else if (typeof input === 'string') {
    // file path
    xmlText = fs.readFileSync(input, 'utf8');
  } else {
    throw new Error('Expected input to be a Buffer or file path string');
  }

  return parseStringPromise(xmlText, {
    explicitArray: false,
    trim: true,
  });
}

module.exports = { parseXMLFile };