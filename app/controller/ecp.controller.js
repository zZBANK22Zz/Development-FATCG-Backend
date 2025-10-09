const ecpService = require('../services/ecp.service');

async function analyzeFile(req, res) {
    if (!req.file || !req.body.config) {
        return res.status(400).send({ message: 'dataFile and config are required!' });
    }

    try {
        const xmlContent = req.file.buffer.toString('utf-8');
        const config = JSON.parse(req.body.config);

        const result = await ecpService.analyzeECP(xmlContent, config);
        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
}

module.exports = { analyzeFile };