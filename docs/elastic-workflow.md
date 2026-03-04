# Elastic Workflow Integration

This version uses [Elastic Workflows](https://www.elastic.co/docs/explore-analyze/workflows) for both word generation and translations, providing centralized configuration through your Elastic stack.

## Overview

The Elastic Workflow approach leverages Elastic's Agent Builder to:
- Generate random words based on configurable themes
- Translate words into multiple languages in a single API call
- Handle all logic centrally in your Elastic workflow
- Provide consistent word generation across multiple devices

## Features

- **Single API Call:** Replaces separate fetch + translate steps
- **Centralized Configuration:** Manage word generation logic in Elastic Agent Builder
- **Per-Device Caching:** Local recent-word tracking to prevent repetition
- **TTL & Size Controls:** Configurable deduplication parameters
- **Offline Fallback:** Uses cached words when API unavailable

## Setup

### 1. Configure Elastic Workflow

Set up your Elastic Agent Builder tool with a word generation workflow. Your workflow should:
- Accept theme/topic parameter
- Accept recent words list for deduplication
- Return word with multilingual translations

Example workflow output format:
```json
{
  "word": "ephemeral",
  "definition": "lasting a very short time",
  "translations": {
    "de": "vergänglich",
    "id": "sementara",
    "km": "rolung pel (រយៈពេល)",
    "vi": "phù du"
  }
}
```

### 2. Install Script

1. Copy `script_elastic.js` (root of repo) to Scriptable
2. Configure credentials (one-time — run inside Scriptable):

```javascript
// One-time: run inside Scriptable to store keys in the system Keychain
Keychain.set("ELASTIC_API_URL", "https://your-elasticsearch-endpoint/...");
Keychain.set("ELASTIC_API_KEY", "base64_api_key_here");
Keychain.set("ELASTIC_TOOL_ID", "word.of.the.day.multilingual");
```

3. Add widget to your home/lock screen

## Configuration

### Language Selection

Edit the `LANG_CONFIG` array in `script_elastic.js` to enable languages for translation and display. Each entry is an object with `code`, `name` and `include`:

```javascript
const LANG_CONFIG = [
  { code: "de", name: "German", include: true },
  { code: "id", name: "Indonesian", include: true },
  { code: "km", name: "Khmer", include: true },
  { code: "vi", name: "Vietnamese", include: true },
  { code: "es", name: "Spanish", include: false },  // Set true to enable
  // ... more languages
];
```

Set `include: true` for any language you want to use.

### Theme Selection

Edit the `THEME` variable in `script_elastic.js` to constrain word generation:

```javascript
const THEME = "anything";  // or "cooking", "technology", "nature", etc.
```

### Deduplication Settings

Control how recently-seen words are filtered:

```javascript
// Time-to-live: how long to remember words
const RECENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Maximum cache size: how many words to remember
const RECENT_MAX = 100;
```

## Local Caching

A local file is stored in `FileManager.documentsDirectory()` as `recent_words.json` to reduce showing the same word repeatedly.

**Cache file location:**
- iOS: Scriptable app's Documents directory
- You can see the path by running the script and checking console logs

**Cache structure:**
```json
[
  {
    "id": "ephemeral",
    "ts": 1709596800000,
    "word": "ephemeral",
    "definition": "lasting a very short time",
    "translations": { ... }
  }
]
```

**Cleanup:**
- Automatically removes entries older than `RECENT_TTL_MS`
- Automatically limits to `RECENT_MAX` entries
- Occurs on every widget refresh

## Architecture

### Request Flow

```
Widget Refresh
    ↓
Load recent words from cache
    ↓
Filter by TTL and size limits
    ↓
Call Elastic Workflow API
    ├─ Pass recent word IDs for deduplication
    ├─ Pass theme parameter
    └─ Request translations for enabled languages
    ↓
Receive word + translations
    ↓
Add to recent cache
    ↓
Display widget
```

### Error Handling

When API calls fail:
1. Try to use most recent cached word
2. Show error widget with helpful message if no cache available
3. Set immediate refresh for retry

**Error types:**
- No internet connection → Uses cached word
- Invalid API credentials → Shows configuration error
- Malformed API response → Uses cached fallback

## Advantages

✅ **Centralized Logic:** Word generation and translation rules live in Elastic, not in the script  
✅ **Consistency:** Same workflow can serve multiple devices/users  
✅ **Flexibility:** Change word generation logic without updating script  
✅ **Enterprise-Ready:** Leverage existing Elastic infrastructure  
✅ **Observability:** Monitor API usage through Elastic dashboards

## Limitations

⚠️ **Requires Elastic Stack:** Need an Elastic deployment and Agent Builder setup  
⚠️ **Single API Call:** No batching—each widget refresh may trigger API call  
⚠️ **Cost:** Elastic API calls may have associated costs depending on your plan  
⚠️ **Complexity:** More infrastructure to manage vs direct LLM calls

## Comparison with LLM Batch Mode

| Aspect | Elastic Workflow | LLM Batch Mode |
|--------|------------------|----------------|
| Setup complexity | Higher (Elastic stack required) | Lower (just API key) |
| API calls/month | ~100-720 depending on refresh | ~2 (batch mode) |
| Cost | Depends on Elastic plan | Free (Gemini) or ~$0.01/month |
| Centralized logic | ✅ Yes (Elastic workflow) | ❌ No (logic in script) |
| Enterprise features | ✅ Full Elastic observability | ❌ Basic logging only |
| Offline resilience | ❌ 1 cached word | ✅ 50 cached words |
| Best for | Teams with existing Elastic | Individual users, low cost |

## Migration to LLM Batch Mode

If you want to switch to the LLM version:

1. Copy `script_llm.js` to Scriptable
2. Set up API key via `setup_keychain.js` or manually
3. Configure languages (same `LANG_CONFIG` format)
4. Update widget to use new script

**No data migration needed** - each version maintains its own cache file.

## Troubleshooting

### Widget shows "Configuration needed"
- Verify `ELASTIC_API_URL`, `ELASTIC_API_KEY`, and `ELASTIC_TOOL_ID` are set in Keychain
- Check credentials are correct

### Widget shows same word repeatedly
- Increase `RECENT_MAX` to remember more words
- Increase `RECENT_TTL_MS` to remember words longer
- Check Elastic workflow is respecting recent words list

### Widget shows "Unable to connect"
- Check internet connection
- Verify Elastic endpoint is accessible
- Check Elastic API key hasn't expired

### Cache file path
Run the script in Scriptable and check console logs for:
```
Documents directory: /var/mobile/Containers/Shared/AppGroup/.../Documents
```

## Support

For Elastic Workflow-specific questions:
- [Elastic Workflows Documentation](https://www.elastic.co/docs/explore-analyze/workflows)
- [Elastic Agent Builder Guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/agent-builder.html)

For widget issues:
- Check the main [README](../README.md) for general usage
- See [issues](https://github.com/your-repo/issues) for known problems
