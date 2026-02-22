const data = require('./iso8_data.json');

// Check Category 1 fixes (negated conditions)
console.log('=== Category 1: Negated conditions ===\n');
for (const charId of ['Kahhori', 'Quasar', 'ShangChi']) {
    console.log(`--- ${charId} ---`);
    const info = data[charId];
    console.log(`  Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    info.notes.forEach(n => console.log(`  [note] ${n}`));
    console.log();
}

// Check Category 2 fixes (if_prev_ran)
console.log('=== Category 2: if_prev_ran condition inheritance ===\n');
for (const charId of ['Apocalypse', 'Blastaar', 'Gwenpool', 'MsMarvelClassic',
                        'Quicksilver', 'ScarletWitch', 'Titania', 'Yelena']) {
    console.log(`--- ${charId} ---`);
    const info = data[charId];
    if (!info) { console.log('  NOT FOUND'); continue; }
    console.log(`  Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    info.notes.forEach(n => console.log(`  [note] ${n}`));
    console.log();
}

// Check Category 3 fixes (ally-relationship)
console.log('=== Category 3: Ally-relationship bonuses ===\n');
for (const charId of ['AncientOne', 'AntMan', 'BlackWidow', 'Deadpool', 'Fantomex']) {
    console.log(`--- ${charId} ---`);
    const info = data[charId];
    if (!info) { console.log('  NOT FOUND'); continue; }
    console.log(`  Damage: ${info.damage}% + ${info.piercing}% Piercing${info.drain ? ' + ' + info.drain + '% Drain' : ''}`);
    info.effects.forEach(e => console.log(`  ${e}`));
    console.log();
}

// Scan for any remaining bare +N% damage effects
console.log('=== Remaining bare +num% damage effects ===');
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
