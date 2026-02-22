const data = require('./iso8_data.json');

// Check Quicksilver specifically (if_prev_ran → if_prev_skipped chain)
console.log('--- Quicksilver ---');
data['Quicksilver'].effects.forEach(e => console.log(`  ${e}`));
console.log();

// Check ScarletWitch
console.log('--- ScarletWitch ---');
data['ScarletWitch'].effects.forEach(e => console.log(`  ${e}`));
console.log();

// Run full audit: re-check all audit findings
const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;

// Recount remaining unhandled issues
let issues = 0;
for (const [charId, charData] of Object.entries(charDataMap)) {
    if (/^NUE|^PVE_|^TestMan$/.test(charId) || charId === 'ForceImportVersion' || charId === 'Name') continue;
    const actions = [];
    if (charData.safety && charData.safety.actions) actions.push(...charData.safety.actions.map(a => ({...a, _src: 'safety'})));
    if (charData.basic && charData.basic.actions) {
        charData.basic.actions.filter(a => a.counter || a.assist !== undefined)
            .filter(a => a.action !== 'empty_result')
            .forEach(a => actions.push({...a, _src: 'basic'}));
    }
    for (const a of actions) {
        // Check only_if_target for remaining unhandled keys
        if (a.only_if_target) {
            const checkUnhandled = (obj, path) => {
                const handled = new Set(['traits', 'target', 'and', 'or', 'not', 'relationship']);
                const unhandled = Object.keys(obj).filter(k => !handled.has(k));
                if (unhandled.length > 0) {
                    console.log(`${charId}: only_if_target${path} unhandled: ${unhandled.join(', ')} = ${JSON.stringify(unhandled.map(k => obj[k]))}`);
                    issues++;
                }
                if (obj.and) obj.and.forEach((sub, i) => checkUnhandled(sub, `${path}.and[${i}]`));
                if (obj.or) obj.or.forEach((sub, i) => checkUnhandled(sub, `${path}.or[${i}]`));
            };
            checkUnhandled(a.only_if_target, '');
        }
        // Check for unhandled action_cond values
        const handledConds = new Set([undefined, 'if_prev_skipped', 'if_has_crit_result',
            'if_has_crit_result_per_target', 'if_prev_ran', 'if_arbitrary_action_ran', 'always']);
        if (!handledConds.has(a.action_cond)) {
            console.log(`${charId}: unhandled action_cond: ${a.action_cond}`);
            issues++;
        }
    }
}
console.log(`\nRemaining unhandled issues: ${issues}`);

// Final scan for bare effects
console.log('\n=== Final scan: bare +num% effects ===');
let found = false;
for (const [charId, info] of Object.entries(data)) {
    if (!info.effects) continue;
    for (const effect of info.effects) {
        if (/^\+\d+% (damage|Piercing)\.?$/.test(effect.trim())) {
            console.log(charId + ': ' + effect);
            found = true;
        }
    }
}
if (!found) console.log('None.');
