const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;

// Check remaining bare damage chars
console.log('=== Remaining bare damage: raw safety actions ===\n');
for (const charId of ['Odin', 'ShadowKing', 'Xavier']) {
    console.log(`--- ${charId} ---`);
    const cd = charDataMap[charId];
    cd.safety.actions.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a)));
    console.log();
}

// Check "Otherwise" issue for AntMan/AncientOne
console.log('=== "Otherwise" issue: raw safety actions ===\n');
for (const charId of ['AntMan', 'AncientOne', 'BlackWidow', 'Fantomex']) {
    console.log(`--- ${charId} ---`);
    const cd = charDataMap[charId];
    cd.safety.actions.forEach((a, i) => {
        const keys = {};
        if (a.action_cond) keys.action_cond = a.action_cond;
        if (a.only_if_target) keys.only_if_target = a.only_if_target;
        if (a.only_if) keys.only_if = a.only_if;
        console.log(`  [${i}] action=${a.action || 'stat_mod'} ${JSON.stringify(keys)}`);
    });
    console.log();
}

// Also check Gwenpool's barrier chain
console.log('=== Gwenpool raw safety actions ===\n');
const gw = charDataMap['Gwenpool'];
gw.safety.actions.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a)));
