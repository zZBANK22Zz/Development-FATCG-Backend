// backend/utils/syntax/syntaxTestGenerator.js
// Purpose: Generate sample strings for Syntax test cases based on regex patterns.
// Exports: { generateSyntaxTests(definitions) }
// - For each definition, produce: valid, invalidValue, invalidAddition, invalidOmission, invalidSubstitution.
// - Includes a special-case generator for 'Date' (DDMonYYYY) to avoid overly random regex outputs.
const RandExp = require('randexp');

// Build symbol list from ASCII ranges:
// 33–47  =>  ! " # $ % & ' ( ) * + , - . /
// 58–64  =>  : ; < = > ? @
// 91–96  =>  [ \ ] ^ _ `
// 123–126=>  { | } ~
const SYMBOL_CODE_RANGES = [
  [33, 47],
  [58, 64],
  [91, 96],
  [123, 126]
];
const SYMBOL_CHARACTERS = SYMBOL_CODE_RANGES.flatMap(([start, end]) => {
  const characters = [];
  for (let i = start; i <= end; i++) {
    characters.push(String.fromCharCode(i));
  }
  return characters;
});

// Build alphanumeric list from ASCII codes:
// 48–57   =>  0–9
// 65–90   =>  A–Z
// 97–122  =>  a–z
const ALPHANUMERIC_CHARACTERS = [];
for (let i = 48; i <= 57; i++) {
  ALPHANUMERIC_CHARACTERS.push(String.fromCharCode(i));
}
for (let i = 65; i <= 90; i++) {
  ALPHANUMERIC_CHARACTERS.push(String.fromCharCode(i));
}
for (let i = 97; i <= 122; i++) {
  ALPHANUMERIC_CHARACTERS.push(String.fromCharCode(i));
}

function pickRandomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function randomAlphanumericChar() {
  return pickRandomItem(ALPHANUMERIC_CHARACTERS);
}
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function generateSyntaxTests(definitions) {
  return definitions.map(definition => {
    let validSample;

    if (definition.name === 'Date') {
      // custom date logic…
      const year = 2000 + Math.floor(Math.random() * 101);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const month = pickRandomItem(months);
      const daysInMonth = {
        Jan:31, Feb: isLeapYear(year) ? 29 : 28, Mar:31, Apr:30,
        May:31, Jun:30, Jul:31, Aug:31, Sep:30, Oct:31,
        Nov:30, Dec:31
      };
      const day = String(Math.floor(Math.random() * daysInMonth[month]) + 1).padStart(2,'0');
      validSample = `${day}${month}${year}`;
    } else {
      validSample = new RandExp(definition.pattern).gen();
    }

    const invalidValue = validSample + pickRandomItem(SYMBOL_CHARACTERS);
    const addPos = Math.floor(Math.random() * (validSample.length + 1));
    const invalidAddition =
      validSample.slice(0, addPos) + pickRandomItem(SYMBOL_CHARACTERS) + validSample.slice(addPos);
    const omitPos = Math.floor(Math.random() * validSample.length);
    const invalidOmission =
      validSample.slice(0, omitPos) + validSample.slice(omitPos + 1);
    const subPos = Math.floor(Math.random() * validSample.length);
    const invalidSubstitution =
      validSample.slice(0, subPos) + randomAlphanumericChar() + validSample.slice(subPos + 1);

    return {
      name:        definition.name,
      description: definition.description,
      regex:       definition.pattern,
      type:        definition.type,
      length:      definition.length,
      testCases: {
        valid: validSample,
        invalidValue,
        invalidSubstitution,
        invalidOmission,
        invalidAddition
      }
    };
  });
}

module.exports = { generateSyntaxTests };