const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;
const output = require('./iso8_data.json');

// Category 1: only_if_target with "not" — clearly missing negated conditions
console.log('=== CATEGORY 1: only_if_target.not (missing negated conditions) ===\n');
for (const [charId, charData] of Object.entries(charDataMap)) {
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;
    const actions = [];
    if (charData.safety && charData.safety.actions) actions.push(...charData.safety.actions.map(a => ({...a, _src: 'safety'})));
    if (charData.basic && charData.basic.actions) {
        charData.basic.actions.filter(a => a.counter || a.assist !== undefined)
            .forEach(a => actions.push({...a, _src: 'basic'}));
    }
    for (const a of actions) {
        if (a.only_if_target && a.only_if_target.not) {
            console.log(`${charId}: only_if_target.not = ${JSON.stringify(a.only_if_target.not)}`);
            console.log(`  Action: ${a.action || 'stat_modifier'}`);
            console.log(`  Current output effects: ${JSON.stringify(output[charId]?.effects?.slice(0, 3))}`);
            console.log();
        }
        // Also check inside and/or arrays
        if (a.only_if_target && a.only_if_target.and) {
            for (const sub of a.only_if_target.and) {
                if (sub.not) {
                    console.log(`${charId}: only_if_target.and[].not = ${JSON.stringify(sub.not)}`);
                    console.log();
                }
            }
        }
    }
}

// Category 2: if_prev_ran — check if these cause visible issues
console.log('\n=== CATEGORY 2: if_prev_ran — sample impact ===\n');
const prevRanChars = new Set();
for (const [charId, charData] of Object.entries(charDataMap)) {
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;
    const actions = [];
    if (charData.safety && charData.safety.actions) actions.push(...charData.safety.actions.map((a,i) => ({...a, _src: 'safety', _idx: i})));
    if (charData.basic && charData.basic.actions) {
        charData.basic.actions.filter(a => a.counter || a.assist !== undefined)
            .forEach((a,i) => actions.push({...a, _src: 'basic', _idx: i}));
    }
    for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        if (a.action_cond === 'if_prev_ran' || a.action_cond === 'if_arbitrary_action_ran') {
            // Find the previous action to see what condition it carries
            const prev = i > 0 ? actions[i-1] : null;
            const prevHasCond = prev && (prev.only_if || prev.only_if_target || prev.only_if_any || prev.only_if_outcome);
            // This action should inherit previous condition but doesn't have its own
            const thisHasCond = a.only_if || a.only_if_target || a.only_if_any || a.only_if_outcome;
            if (!thisHasCond && prevHasCond) {
                prevRanChars.add(charId);
                console.log(`${charId} [${a._src}]: action_cond=${a.action_cond}, action=${a.action || 'stat_modifier'}`);
                if (prev) {
                    const condKeys = [];
                    if (prev.only_if) condKeys.push('only_if');
                    if (prev.only_if_target) condKeys.push('only_if_target');
                    if (prev.only_if_any) condKeys.push('only_if_any');
                    console.log(`  Prev action had: ${condKeys.join(', ')}`);
                    if (prev.only_if && prev.only_if.mode) console.log(`  Prev mode: ${prev.only_if.mode}`);
                    if (prev.only_if && prev.only_if.owner) console.log(`  Prev owner: ${JSON.stringify(prev.only_if.owner)}`);
                }
                console.log();
            }
        }
    }
}
console.log(`Total characters with if_prev_ran inheriting conditions: ${prevRanChars.size}`);

// Category 3: only_if_target.relationship = "ally"
console.log('\n\n=== CATEGORY 3: only_if_target with relationship="ally" — sample ===\n');
let allyCount = 0;
for (const [charId, charData] of Object.entries(charDataMap)) {
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;
    const actions = [];
    if (charData.safety && charData.safety.actions) actions.push(...charData.safety.actions.map(a => ({...a, _src: 'safety'})));
    if (charData.basic && charData.basic.actions) {
        charData.basic.actions.filter(a => a.counter || a.assist !== undefined)
            .forEach(a => actions.push({...a, _src: 'basic'}));
    }
    for (const a of actions) {
        const checkRelationship = (obj, path) => {
            if (obj.relationship === 'ally') {
                if (allyCount < 5) {
                    console.log(`${charId}: only_if_target${path}.relationship = "ally"`);
                    console.log(`  Traits: ${JSON.stringify(obj.traits)}`);
                    console.log(`  Action: ${a.action}, target: ${JSON.stringify(a.target)}`);
                    console.log();
                }
                allyCount++;
            }
            if (obj.and) obj.and.forEach((sub, i) => checkRelationship(sub, `${path}.and[${i}]`));
        };
        if (a.only_if_target) checkRelationship(a.only_if_target, '');
    }
}
console.log(`Total ally-relationship conditions: ${allyCount}`);
