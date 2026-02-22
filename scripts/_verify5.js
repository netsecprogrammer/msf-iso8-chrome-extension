const data = require('./iso8_data.json');

// Check all previously problematic characters
const chars = [
    'PhantomRider', 'Longshot', 'Shatterstar',  // v2.9.0 fixes
    'Kahhori', 'Quasar', 'ShangChi',             // Cat 1: negated conditions
    'Apocalypse', 'Blastaar', 'Gwenpool',         // Cat 2: if_prev_ran
    'MsMarvelClassic', 'Quicksilver', 'ScarletWitch',
    'Titania', 'Yelena',
    'Odin', 'ShadowKing', 'Xavier',               // Cat 2b: ally no traits
    'AncientOne', 'AntMan', 'BlackWidow',         // Cat 3: ally relationship
    'Deadpool', 'Fantomex'
];

for (const charId of chars) {
    const info = data[charId];
    if (!info) continue;
    console.log(`--- ${charId} ---`);
    console.log(`  ${info.damage}% dmg + ${info.piercing}% pierce${info.drain ? ' + ' + info.drain + '% drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    if (info.notes.length > 0) info.notes.forEach(n => console.log(`  [note] ${n}`));
    console.log();
}

// Final scans
console.log('=== SCAN: Bare +num% effects ===');
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

console.log('\n=== SCAN: "On Crit, Otherwise" ===');
found = false;
for (const [charId, info] of Object.entries(data)) {
    if (!info.effects) continue;
    for (const effect of info.effects) {
        if (/On Crit, Otherwise/.test(effect)) {
            console.log(charId + ': ' + effect);
            found = true;
        }
    }
}
if (!found) console.log('None.');
