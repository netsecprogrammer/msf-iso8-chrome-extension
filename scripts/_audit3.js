const fs = require('fs');
const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;
const output = require('./iso8_data.json');

// Show full output for Category 1 characters (negated only_if_target)
console.log('=== CATEGORY 1: Full output for negated condition chars ===\n');
for (const charId of ['Kahhori', 'Quasar', 'ShangChi']) {
    const info = output[charId];
    console.log(`--- ${charId} ---`);
    console.log(`Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    info.notes.forEach(n => console.log(`  [note] ${n}`));
    console.log();
}

// Show full output for Category 2 characters (if_prev_ran)
console.log('=== CATEGORY 2: Full output + raw action chains for if_prev_ran chars ===\n');
for (const charId of ['Apocalypse', 'Blastaar', 'Gwenpool', 'MsMarvelClassic',
                        'Quicksilver', 'ScarletWitch', 'Titania', 'Yelena']) {
    const info = output[charId];
    if (!info) continue;
    console.log(`--- ${charId} ---`);
    console.log(`Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    info.notes.forEach(n => console.log(`  [note] ${n}`));

    // Show the relevant action chain from raw data
    const charData = charDataMap[charId];
    const safetyActions = charData.safety?.actions || [];
    for (let i = 0; i < safetyActions.length; i++) {
        const a = safetyActions[i];
        if (a.action_cond === 'if_prev_ran') {
            console.log(`  [RAW chain] action[${i-1}]: ${JSON.stringify({
                action: safetyActions[i-1]?.action,
                only_if: safetyActions[i-1]?.only_if ? '...' : undefined,
                only_if_target: safetyActions[i-1]?.only_if_target ? '...' : undefined,
            })}`);
            console.log(`  [RAW chain] action[${i}]: action_cond=if_prev_ran, action=${a.action}, ${JSON.stringify({
                procs: a.procs?.map?.(p => p.proc || p) || a.procs,
                count: a.count,
                category: a.category,
                target: a.target,
                health_pct: a.health_pct
            })}`);
        }
    }
    console.log();
}

// Category 3: Show a few ally-relationship examples with full context
console.log('=== CATEGORY 3: Sample ally-relationship action contexts ===\n');
let shown = 0;
for (const [charId, charData] of Object.entries(charDataMap)) {
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;
    if (shown >= 5) break;
    const safetyActions = charData.safety?.actions || [];
    for (const a of safetyActions) {
        if (!a.only_if_target) continue;
        const hasAllyRel = JSON.stringify(a.only_if_target).includes('"relationship":"ally"');
        if (!hasAllyRel) continue;
        console.log(`--- ${charId} ---`);
        console.log(`  Action: ${a.action || 'stat_modifier'}`);
        console.log(`  only_if_target: ${JSON.stringify(a.only_if_target)}`);
        console.log(`  stat_modifier: ${JSON.stringify(a.stat_modifier?.map(m => ({stat: m.stat, delta: m.delta})))}`);
        console.log(`  Current output: ${JSON.stringify(output[charId]?.effects?.slice(0, 2))}`);
        shown++;
        break;
    }
}
