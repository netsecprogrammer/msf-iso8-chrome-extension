const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;

// Check AntMan basic counter/assist actions
console.log('=== AntMan basic counter/assist actions ===');
const ant = charDataMap['AntMan'];
if (ant.basic && ant.basic.actions) {
    ant.basic.actions.filter(a => a.counter || a.assist !== undefined).forEach((a, i) => {
        console.log(`  [${i}]`, JSON.stringify(a));
    });
}

console.log('\n=== BlackWidow basic counter/assist actions ===');
const bw = charDataMap['BlackWidow'];
if (bw.basic && bw.basic.actions) {
    bw.basic.actions.filter(a => a.counter || a.assist !== undefined).forEach((a, i) => {
        console.log(`  [${i}]`, JSON.stringify(a));
    });
}

console.log('\n=== AncientOne basic counter/assist actions ===');
const ao = charDataMap['AncientOne'];
if (ao.basic && ao.basic.actions) {
    ao.basic.actions.filter(a => a.counter || a.assist !== undefined).forEach((a, i) => {
        console.log(`  [${i}]`, JSON.stringify(a));
    });
}
