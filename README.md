# Multilingual Lock Screen Vocab Widget (Scriptable)

This project is a **personalizable vocabulary widget** for iOS and MacOS built with the [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) app. It shows a random word in **multiple languages** as a widget on your **home/lock screen**.

The focus is on **daily passive exposure** to vocabulary across several languages at once.

---

## Main Version — Elastic (recommended)

The preferred and primary integration is the Elastic Agent Builder-based script. It provides centralized, high-quality word generation and translation with a single call to your Elastic agent, and includes local caching/deduplication to avoid repeats.

### script_elastic.js — Elastic Agent Builder (recommended)
- Uses Elastic Agent Builder for both word generation and translations
- Single API call replaces separate fetch + translate steps
- Centralized configuration via your Elastic agent/tool
- Includes per-device recent-cache, TTL and size controls
- Best choice for production use and centralized control

---

## Alternatives

If you prefer a simpler local or public-API approach, two alternatives are available in the `scripts/` folder.

### scripts/script_static.js — Static Vocabulary List
- Self-contained vocabulary entries defined in the script
- No internet connection required
- Perfect for curated or personal word lists
- Easy to customize and add your own words

### scripts/script_api.js — Dynamic with Public APIs
- Fetches random words from a public random word API
- Translates words using a public translation API (LibreTranslate or similar)
- Gets fresh vocabulary automatically
- Requires internet connection
- Easy to run without Elastic infrastructure

---

## Features

- **Lock screen rectangular widget** layout:
  - One entry at a time
  - One row per language with consistent sizing
- **Home screen widget** layout:
  - Optional concept/definition line
  - Same multi-row multilingual display
- **Language-agnostic design**:
  - Easy to customize which languages to display
  - Simple configuration via language code array
**Customization**
- **Languages:** Edit the `LANG_CONFIG` array in `script_elastic.js` to enable languages for translation and display. Each entry is an object with `code`, `name` and `include` (set `include: true` to use a language).
- **Theme/topic:** Edit the `THEME` variable in `script_elastic.js` to constrain generation (default: "anything").
- **Deduplication:** Adjust `RECENT_TTL_MS` and `RECENT_MAX` in `script_elastic.js` to control how recently-seen words are filtered.

---

## Quick Start


### Quick Start

#### Elastic (recommended)

1. Set up Elastic Agent Builder tool with your word generation workflow
2. Copy `script_elastic.js` (root of repo) to Scriptable
3. Configure credentials (one-time — run inside Scriptable):

```javascript
// One-time: run inside Scriptable to store keys in the system Keychain
Keychain.set("ELASTIC_API_URL", "https://your-elasticsearch-endpoint/...");
Keychain.set("ELASTIC_API_KEY", "base64_api_key_here");
Keychain.set("ELASTIC_TOOL_ID", "word.of.the.day.multilingual");
```

4. Add widget

`script_elastic.js` reads from Scriptable Keychain first, then falls back to environment variables when run in Node/CI. Keep local env secrets out of git and use `.env.example` as a template.

#### Alternatives — Static and API

Using the static or API versions is simpler and works without Elastic. They are available in the `scripts/` folder.

Static:
1. Open Scriptable app on iOS
2. Create a new script and paste the contents of `scripts/script_static.js`
3. Customize the `entries` array with your vocabulary and set `USER_LANGUAGE_CODES`
4. Add widget to your lock or home screen

API:
1. Copy `scripts/script_api.js` to Scriptable
2. Configure the top-level constants (`USER_LANGUAGE_CODES`, `WORDS_TO_FETCH`, etc.)
3. Add widget (requires internet connection)

#### Local caching, deduplication and refresh (important)

- The Elastic version maintains a small per-device recent-cache to avoid showing the same word repeatedly. The script persists this cache to `recent_words.json` as an array of objects with timestamps: `[ { "id": "...", "ts": 168... }, ... ]`. When calling the Elastic tool the script passes the ids as `tool_params.recent_words` so the agent can avoid recently-shown words.

- Where the file is stored:
   - Scriptable (iOS/iPadOS): Scriptable's Documents container → `recent_words.json` (the script writes to `FileManager.documentsDirectory()`). Inspect it via Scriptable's Files view or the Files app (On My iPhone/iPad → Scriptable → Documents).
   - macOS / Node: when running with Node the script falls back to writing `recent_words.json` into the repository working directory (project root). Inspect it with `cat`, `jq`, or your editor.

-- TTL (expiry): each entry includes a `ts` timestamp (ms since epoch) and the script applies a lazy TTL on load. Configure the expiry duration with the `RECENT_TTL_MS` constant in `script_elastic.js` (root of repository) (milliseconds). Set `RECENT_TTL_MS <= 0` to disable expiry. Default in the script is 5 minutes.

- Size limit: control how many recent ids are kept with `RECENT_MAX` (0 = unbounded). The default is `0` (no size limit); set it to a positive integer to cap stored entries.

- QuickLook & logging: by default QuickLook popup is disabled to avoid intrusive popups during interactive runs. The script logs each recent entry as a separate console line including a readable local timestamp. Re-enable QuickLook by setting `ENABLE_QUICKLOOK = true` in the script.

- Elastic tool id and credentials: the script reads `ELASTIC_API_URL` and `ELASTIC_API_KEY` from Scriptable Keychain (preferred) or environment variables. If `ELASTIC_TOOL_ID` is not provided, it falls back to the default tool id `word.of.the.day.multilingual`.

- Note about refresh hints: the iOS refresh hint (`widget.refreshAfterDate`) remains a best-effort hint to the system. The per-device deduplication above helps avoid repeats even if iOS delays refreshes. For global deduplication across devices use a central store (Redis/Upstash) or server-side solution.

**Currently Supported Language Codes:**
1. `ar` - Arabic
2. `yue` - Cantonese (Yue)
3. `nl` - Dutch
4. `fr` - French
5. `de` - German
6. `el` - Greek
7. `he` - Hebrew
8. `hi` - Hindi
9. `id` - Indonesian
10. `it` - Italian
11. `ja` - Japanese
12. `km` - Khmer
13. `ko` - Korean
14. `zh` - Mandarin / Chinese
15. `pl` - Polish
16. `pt` - Portuguese
17. `ru` - Russian
18. `es` - Spanish
19. `sw` - Swahili
20. `tl` - Tagalog
21. `th` - Thai
22. `tr` - Turkish
23. `vi` - Vietnamese

---

## How It Works

Each script version follows the same basic pattern:

1. **Fetch/Select Word Data**
   - Static: Randomly picks from predefined entries
   - API: Calls random word API + translation API
   - Elastic: Calls Elastic Agent Builder tool

2. **Transform to Widget Format**
   - Extracts word, definition, and translations
   - Maps to configured language codes

3. **Render Widget**
   - Creates appropriate layout for lock screen or home screen
   - Displays each language translation in rows
