const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;
const output = require('./iso8_data.json');

// Check ShangChi raw safety actions (seems like it's missing damage bonus)
console.log('=== ShangChi raw safety actions ===');
const sc = charDataMap['ShangChi'];
sc.safety.actions.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a)));
console.log('  Output:', JSON.stringify(output['ShangChi']));

// Check Kahhori's action with not: {target: {any_proc_of_type: "buff"}}
console.log('\n=== Kahhori raw safety actions (focused on missing conditions) ===');
const kh = charDataMap['Kahhori'];
kh.safety.actions.forEach((a, i) => {
    if (a.only_if_target && a.only_if_target.not) {
        console.log(`  [${i}]`, JSON.stringify(a));
    }
});

// Check Quicksilver's full chain
console.log('\n=== Quicksilver full safety chain ===');
const qs = charDataMap['Quicksilver'];
qs.safety.actions.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a)));
console.log('  Output:', JSON.stringify(output['Quicksilver'], null, 2));

// Check ScarletWitch chain context
console.log('\n=== ScarletWitch safety actions with conditions ===');
const sw = charDataMap['ScarletWitch'];
sw.safety.actions.forEach((a, i) => {
    if (a.only_if || a.action_cond) {
        console.log(`  [${i}] action=${a.action || 'stat_mod'}, cond=${a.action_cond || 'none'}, only_if=${a.only_if ? JSON.stringify(a.only_if) : 'none'}`);
    }
});

// Check Category 3: see if ally-relationship stat_modifiers produce wrong output
console.log('\n=== Category 3: ally-relationship — full output for affected chars ===');
for (const charId of ['AncientOne', 'AntMan', 'BlackWidow', 'Deadpool', 'Fantomex']) {
    const info = output[charId];
    if (!info) continue;
    console.log(`--- ${charId} ---`);
    console.log(`  Damage: ${info.damage}% + ${info.piercing}% Piercing`);
    info.effects.forEach(e => console.log(`  ${e}`));

    // Show all safety stat_modifier actions
    const cd = charDataMap[charId];
    if (cd.safety && cd.safety.actions) {
        const statMods = cd.safety.actions.filter(a => a.stat_modifier);
        statMods.forEach((a, i) => {
            const dmg = a.stat_modifier.find(m => m.stat === 'ability_damage_pct');
            const pierce = a.stat_modifier.find(m => m.stat === 'armor_pierce_pct');
            const cond = a.only_if_target ? `only_if_target: ${JSON.stringify(a.only_if_target)}` : 'unconditional';
            console.log(`  [stat_mod ${i}] dmg=${dmg ? JSON.stringify(dmg.delta) : 'n/a'}, pierce=${pierce ? JSON.stringify(pierce.delta) : 'n/a'}, ${cond}`);
        });
    }
    console.log();
}
