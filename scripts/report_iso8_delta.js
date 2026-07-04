const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node scripts/report_iso8_delta.js <current_iso8.json> <generated_iso8.json> [M3HeroSheet.json]');
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function isSkippedRosterId(id) {
  return id === 'ForceImportVersion' ||
    id === 'Name' ||
    /^NUE|^PVE_|^TestMan$|^TestCharacter/.test(id);
}

function parseArgs(argv) {
  const [currentPath, generatedPath, heroSheetPath] = argv;
  if (!currentPath || !generatedPath) usage();
  return {
    currentPath: path.resolve(currentPath),
    generatedPath: path.resolve(generatedPath),
    heroSheetPath: heroSheetPath ? path.resolve(heroSheetPath) : null
  };
}

function summarize(currentData, generatedData, heroSheetData) {
  const currentKeys = Object.keys(currentData).sort();
  const generatedKeys = Object.keys(generatedData).sort();

  const added = generatedKeys.filter(key => !currentData[key]);
  const removed = currentKeys.filter(key => !generatedData[key]);
  const changed = generatedKeys.filter(key =>
    currentData[key] && stableStringify(currentData[key]) !== stableStringify(generatedData[key])
  );

  const testRows = generatedKeys.filter(key => /^TestCharacter/.test(key));
  const rawEnumTokens = [...new Set((stableStringify(generatedData).match(/\b(EXALTEDXMEN|SYMBIOTESIX|SHADOWCONCLAVE)\b/g) || []))].sort();

  let rosterCount = null;
  let generatedMissingRoster = [];
  if (heroSheetData) {
    const heroMap = heroSheetData.Data || heroSheetData;
    const rosterKeys = Object.keys(heroMap).filter(key => !isSkippedRosterId(key)).sort();
    rosterCount = rosterKeys.length;
    generatedMissingRoster = rosterKeys.filter(key => !generatedData[key]);
  }

  return {
    currentCount: currentKeys.length,
    generatedCount: generatedKeys.length,
    rosterCount,
    addedCount: added.length,
    added,
    removedCount: removed.length,
    removed,
    changedCount: changed.length,
    changed,
    generatedMissingRosterCount: generatedMissingRoster.length,
    generatedMissingRoster,
    testRows,
    rawEnumTokens
  };
}

const { currentPath, generatedPath, heroSheetPath } = parseArgs(process.argv.slice(2));
const currentData = readJson(currentPath);
const generatedData = readJson(generatedPath);
const heroSheetData = heroSheetPath ? readJson(heroSheetPath) : null;

console.log(JSON.stringify(summarize(currentData, generatedData, heroSheetData), null, 2));
