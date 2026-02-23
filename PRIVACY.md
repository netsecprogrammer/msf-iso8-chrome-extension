# Privacy Policy

## MSF ISO-8 Counter/Assist Viewer

**Last Updated:** February 22, 2026

### Data Collection

This extension does **not collect, store, or transmit any user data**.

### What This Extension Does

- Reads the URL of Marvel Strike Force character pages to identify which character you are viewing and which language to display
- Fetches character data (`iso8_data.json`) from this extension's GitHub repository and caches it locally for 24 hours
- Displays the data (ISO-8 Counter/Assist abilities) directly on the page, translated into your selected language
- Translation dictionaries (`locales.json`) are bundled locally within the extension

### What This Extension Does NOT Do

- Does not collect personal information
- Does not track browsing history
- Does not use cookies
- Does not share any information with third parties
- Does not access any data beyond marvelstrikeforce.com character pages
- The only network request is fetching character data from this extension's own GitHub repository (`raw.githubusercontent.com`)

### Permissions Explained

| Permission | Purpose |
|------------|---------|
| `host_permissions: marvelstrikeforce.com` | Required to inject the ISO-8 information panel on character pages |
| `host_permissions: raw.githubusercontent.com` | Required to fetch the latest character data from this extension's GitHub repository |
| `storage` | Required to cache character data locally for 24 hours so the extension loads quickly and works offline |

### Data Storage

- Character data (414+ characters) is fetched from this extension's GitHub repository and cached locally in your browser using Chrome's `storage` API for 24 hours
- Translation dictionaries for 8 languages are bundled within the extension package
- No user data is ever stored

### Contact

For questions about this privacy policy, please open an issue on the GitHub repository.

### Changes to This Policy

Any changes to this privacy policy will be reflected in the "Last Updated" date above.
