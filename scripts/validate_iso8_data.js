const fs = require('fs');
const path = require('path');

const REQUIRED_20260703_ROWS = [
  'Angel',
  'Annihilus',
  'BladeMighty',
  'Executioner',
  'HighEvolutionary',
  'Maestro',
  'Malekith',
  'Morph',
  'RachelColeAlves',
  'Riot',
  'SilverSurferBreaker',
  'SpiderWomanJulia',
  'StormMighty',
  'SymbioteQuicksilver',
  'Toxin'
];

function usage() {
  console.error('Usage: node scripts/validate_iso8_data.js <iso8_data.json>');
  process.exit(1);
}

function fail(errors) {
  console.error(JSON.stringify({ valid: false, errors }, null, 2));
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) usage();

const data = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const keys = Object.keys(data);
const serialized = JSON.stringify(data);
const errors = [];

if (keys.length !== 432) {
  errors.push(`Expected 432 generated rows, found ${keys.length}`);
}

const missingRequired = REQUIRED_20260703_ROWS.filter(key => !data[key]);
if (missingRequired.length > 0) {
  errors.push(`Missing required 2026-07-03 rows: ${missingRequired.join(', ')}`);
}

const testRows = keys.filter(key => /^TestCharacter/.test(key));
if (testRows.length > 0) {
  errors.push(`Generated data includes test rows: ${testRows.join(', ')}`);
}

const rawEnumTokens = [...new Set((serialized.match(/\b(EXALTEDXMEN|SYMBIOTESIX|SHADOWCONCLAVE)\b/g) || []))].sort();
if (rawEnumTokens.length > 0) {
  errors.push(`Generated data includes raw enum tokens: ${rawEnumTokens.join(', ')}`);
}

const badDisplayText = [
  'SYMBIOTE SIX',
  'OMEN characters',
  'RETCON allies',
  'DARINGWARRIOR',
  'SECRETAVENGER'
].filter(text => serialized.includes(text));
if (badDisplayText.length > 0) {
  errors.push(`Generated data includes unpolished display text: ${badDisplayText.join(', ')}`);
}

const requiredSnippets = {
  Annihilus: 'Share Drain healing with 5 random allies.',
  SamWilson: 'Gain +1 Deflect, up to a maximum of 5.',
  SymbioteQuicksilver: 'Symbiote Six characters',
  CullObsidian: 'Omen characters',
  JeffTheLandShark: 'Retcon allies'
};
for (const [key, snippet] of Object.entries(requiredSnippets)) {
  const rowText = data[key] ? JSON.stringify(data[key]) : '';
  if (!rowText.includes(snippet)) {
    errors.push(`${key} is missing expected text snippet: ${snippet}`);
  }
}

for (const key of keys) {
  const row = data[key];
  if (!row || typeof row.description !== 'string') {
    errors.push(`${key} is missing a string description`);
  }
  if (!Array.isArray(row.effects)) {
    errors.push(`${key} is missing effects[]`);
  }
  if (!Array.isArray(row.notes)) {
    errors.push(`${key} is missing notes[]`);
  }
}

if (errors.length > 0) fail(errors);

console.log(JSON.stringify({
  valid: true,
  rows: keys.length,
  requiredRows: REQUIRED_20260703_ROWS.length,
  testRows: 0,
  rawEnumTokens: 0
}, null, 2));
