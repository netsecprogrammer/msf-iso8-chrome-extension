# MSF ISO-8 Counter/Assist Viewer

A Chrome extension that displays ISO-8 Counter Attack/Assist ability information on Marvel Strike Force character pages.

## Features

- Automatically displays ISO-8 Counter/Assist ability info when viewing character pages
- Shows damage percentages, piercing values, and all effects
- Special styling for WAR, RAID, and CRUCIBLE-specific effects
- Works with dynamic navigation (SPA behavior)
- Clean, game-themed UI design

## Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right corner)
3. Click **Load unpacked**
4. Select the `msf-iso8-chrome-extension` folder
5. The extension should now appear in your extensions list

### Method 2: Pack and Install

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Pack extension**
4. Select the `msf-iso8-chrome-extension` folder
5. This creates a `.crx` file you can share/install

## Usage

1. Navigate to https://marvelstrikeforce.com/en/hero-total-stats
2. Click on any character (e.g., Red Guardian)
3. You'll be taken to the character's page (e.g., `/en/characters/RedGuardian`)
4. The ISO-8 Counter/Assist panel will automatically appear at the top of the page

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Chrome extension configuration |
| `content.js` | Content script that injects the ISO-8 panel |
| `iso8_data.js` | Character ISO-8 data (450 characters) |
| `styles.css` | Styling for the info panel |
| `icon48.png` | Small extension icon |
| `icon128.png` | Large extension icon |

## Data Source

The ISO-8 Counter/Assist data was extracted from Marvel Strike Force game files:
- **Game Data Version:** com.foxnextgames.m3-172026
- **Extraction Date:** January 7, 2026
- **Total Characters:** 450

## Example Output

### Red Guardian
```
Attack primary target for 255% damage + 17% Piercing
- Gain Defense Up.
- In WAR, apply Defense Up to adjacent allies.
```

### Blue Marvel
```
Attack primary target for 450% Piercing
- Flip positive effects.
```

### Black Cat
```
Attack primary target for 456% Piercing
- Gain Slow + Bleed + Bleed.
- Gain Turn Meter.
- Gain Turn Meter.
- Gain Stealth.
```

## Troubleshooting

### Panel not appearing
- Make sure you're on a character page URL matching `/en/characters/[CharacterName]`
- Try refreshing the page
- Check if the extension is enabled in `chrome://extensions/`

### Character not found
- The character ID in the URL must match the game's internal ID
- Some characters may have different URL names than expected
- The extension tries multiple name variations automatically

## Updating Data

To update with new game data:
1. Run the extraction scripts on new game files
2. Replace `iso8_counter_assist_detailed.json` in the parent folder
3. Run `node convert_data.js` to regenerate `iso8_data.js`
4. Reload the extension in Chrome

## License

This extension is for personal use with Marvel Strike Force data research.

---

*Created January 7, 2026*
