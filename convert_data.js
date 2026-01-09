// Convert JSON data to JavaScript variable for Chrome extension
const fs = require('fs');

// Use the v3 (fixed) JSON file with drain, health_redistribute, and complex mechanics
const path = require('path');
const jsonPath = path.join(__dirname, '..', 'iso8_counter_assist_detailed_v3.json');
const outputPath = path.join(__dirname, 'iso8_data.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const jsContent = `// MSF ISO-8 Counter/Assist Data
// Auto-generated from game data
// Extension Version: 1.8.7
// Total characters: ${Object.keys(data).length}
// Last updated: ${new Date().toISOString().split('T')[0]}

const ISO8_DATA = ${JSON.stringify(data, null, 2)};
`;

fs.writeFileSync(outputPath, jsContent);
console.log(`Created ${outputPath} with ${Object.keys(data).length} characters`);
