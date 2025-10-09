const xml2js = require('xml2js');
const _ = require('lodash');

async function analyzeECP(xmlString, config) {
    function evaluateCondition(value, condition) {
    const numValue = Number(value);
    const isValueNaN = isNaN(numValue);

    switch (condition.operator) {
        case 'isNumber':
            return !isValueNaN;
        case 'isNotNumber':
            return isValueNaN;
        case 'lt': // less than
            return !isValueNaN && numValue < condition.value;
        case 'gt': // greater than
            return !isValueNaN && numValue > condition.value;
        case 'between':
            return !isValueNaN && numValue >= condition.min && numValue <= condition.max;
        // เพิ่ม operator อื่นๆ ที่ต้องการได้ที่นี่ (gte, lte, eq)
        default:
            return false;
    }
}

    const parser = new xml2js.Parser({ explicitArray: false, trim: true });
    try {
        const result = await parser.parseStringPromise(xmlString);
        const testItems = _.get(result, config.dataSelector, []);

        if (!Array.isArray(testItems)) {
            throw new Error(`Data selector "${config.dataSelector}" did not resolve to an array.`);
        }

        // สร้างโครงสร้างผลลัพธ์จาก config
        const ecpResult = {};
        config.ecpClasses.forEach(cls => {
            ecpResult[cls.name] = {
                description: cls.description,
                type: cls.type,
                cases: []
            };
        });

        // วนลูปเพื่อทดสอบและจัดกลุ่ม
        for (const item of testItems) {
            const valueToTest = _.get(item, config.fieldToTest);
            for (const ecpClass of config.ecpClasses) {
                if (evaluateCondition(valueToTest, ecpClass.condition)) {
                    ecpResult[ecpClass.name].cases.push(item);
                    break;
                }
            }
        }
        return ecpResult;
    } catch (error) {
        console.error("ECP Engine Error:", error);
        throw new Error(error.message || "Could not process the file.");
    }
}

module.exports = { analyzeECP };