const data = require('./iso8_data.json');

// Check fixed chars
console.log('=== Previously bare damage (Odin, ShadowKing, Xavier) ===\n');
for (const charId of ['Odin', 'ShadowKing', 'Xavier']) {
    console.log(`--- ${charId} ---`);
    const info = data[charId];
    console.log(`  Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    info.notes.forEach(n => console.log(`  [note] ${n}`));
    console.log();
}

// Check Gwenpool barrier chain
console.log('=== Gwenpool ===');
const gw = data['Gwenpool'];
console.log(`  Damage: ${gw.damage}% + ${gw.piercing}% Piercing`);
gw.effects.forEach(e => console.log(`  ${e}`));
console.log();

// Check AncientOne "Otherwise" issue
console.log('=== AncientOne ===');
const ao = data['AncientOne'];
console.log(`  Damage: ${ao.damage}% + ${ao.piercing}% Piercing`);
ao.effects.forEach(e => console.log(`  ${e}`));
console.log();

// Final scan: any remaining bare +num% lines
console.log('=== Remaining bare +num% damage/Piercing effects ===');
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
if (!found) console.log('None found.');

// Scan for remaining "Otherwise" issues — effects where "Otherwise" appears without context
console.log('\n=== Effects starting with "On Crit, Otherwise" ===');
found = false;
for (const [charId, info] of Object.entries(data)) {
    if (!info.effects) continue;
    for (const effect of info.effects) {
        if (effect.includes('On Crit, Otherwise')) {
            console.log(charId + ': ' + effect);
            found = true;
        }
    }
}
if (!found) console.log('None found.');
