# LLM Batch Mode Architecture

## Overview

The LLM version (`script_llm.js`) uses an optimized **batch mode architecture** that dramatically reduces API costs while maintaining word variety and preventing repetition. This document explains how the system works.

## Cost Optimization: The Batch Strategy

### Problem
- Original approach: 1 API call per word
- At 1-hour rotation: ~720 API calls/month (~$0.50-2.00/month)
- At 5-minute rotation for testing: Much higher costs

### Solution: Batch Fetching
- **1 API call = 50 words** (configurable via `BATCH_SIZE`)
- Words are cached locally and rotated through over time
- New batch fetched only when cache runs low (`MIN_CACHE_THRESHOLD = 10`)

### Cost Reduction
- **~98% savings**: From ~100 calls/month to **~2 calls/month**
- Production mode (60-minute rotation): Fetch once every ~25 days
- Testing mode (5-minute rotation): Fetch once every ~4 hours

## Architecture Components

### 1. Cache File Structure

**File:** `word_cache.json` (stored in Scriptable Documents directory)

```json
{
  "current_word_index": 0,
  "current_word_timestamp": 1709596800000,
  "theme": "anything",
  "batch": [
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
    // ... 49 more words
  ],
  "history": [
    { "id": "ephemeral", "ts": 1709596800000 },
    { "id": "perspicuous", "ts": 1709593200000 }
    // ... more entries up to 24 hours old
  ]
}
```

**Fields:**
- `current_word_index`: Position in batch (0-49)
- `current_word_timestamp`: When current word was first shown
- `theme`: Current generation theme (triggers cache clear if changed)
- `batch`: Array of pre-fetched words
- `history`: Deduplication tracking (TTL-based)

### 2. Word Rotation System

**Configuration:**
```javascript
const WORD_ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes (testing)
// Change to: 60 * 60 * 1000 for production (1 hour)
```

**How It Works:**
1. Widget refreshes (iOS decides frequency)
2. Check: Has `WORD_ROTATION_INTERVAL` elapsed since `current_word_timestamp`?
3. If YES → advance `current_word_index++`, update timestamp, show new word
4. If NO → show same word from `current_word_index`

**Key Benefit:** Word stays stable across widget refreshes within the interval. User sees consistent word even if widget redraws multiple times.

### 3. Deduplication Strategy

**Goal:** Avoid repeating words within 24 hours

**Implementation:**
```javascript
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
```

**How It Works:**
1. Each displayed word is added to `history` with timestamp: `{id: "word", ts: Date.now()}`
2. When fetching new batch, pass history IDs to LLM: "DO NOT include these recent words: [...]"
3. On cache save, filter history to remove entries older than `DEDUP_TTL_MS`
4. No size limit—history grows naturally until entries age out

**Why TTL-only?**
- Original design had both TTL (24h) and SIZE (200 words)
- Redundant: TTL enforces the actual requirement
- Size limit was just defensive programming
- At 1-hour rotation: Only ~24 entries in history
- At 5-minute rotation: Only ~288 entries max (tiny memory footprint)

### 4. Cache Management Flow

```
Widget Refresh
    ↓
Load cache from disk
    ↓
Detect theme change? → YES → Clear batch/history
    ↓ NO
Check batch size < MIN_CACHE_THRESHOLD?
    ↓ YES
Fetch new batch (BATCH_SIZE=50 words)
    ↓
Append to existing batch (preserve unused words)
    ↓
Get current word (check rotation interval)
    ↓
Add word to history
    ↓
Save cache (apply TTL filter)
    ↓
Display widget
```

### 5. Error Handling & Fallbacks

**Error Scenarios:**
1. No internet connection
2. Invalid/missing API key
3. API rate limits or errors
4. Malformed LLM response

**Fallback Chain:**
```
API Error
    ↓
Try to use current word from cache
    ↓ (cache empty)
Try to use first word from batch
    ↓ (batch empty)
Show error widget with helpful message
    ↓
Set refreshAfterDate = now (retry immediately when possible)
```

**Error Widget Intelligence:**
- Detects missing API key → "Configuration needed: Set GEMINI_API_KEY in Keychain"
- Generic network errors → "Unable to fetch words: Check internet connection"
- Shows user-friendly messages (not raw error stack traces)

### 6. Theme Change Detection

**Purpose:** Ensure immediate effect when user changes `THEME` constant

**Implementation:**
```javascript
function detectThemeChange(cache) {
  if (cache.theme !== THEME) {
    console.log(`Theme changed from "${cache.theme}" to "${THEME}". Clearing cache.`);
    cache.batch = [];
    cache.current_word_index = 0;
    cache.current_word_timestamp = 0;
    cache.theme = THEME;
    return true;
  }
  return false;
}
```

**Behavior:**
- Compares cached theme vs current `THEME` constant
- If different → clear all cached words, reset index/timestamp
- Next refresh will fetch fresh batch with new theme
- Ensures themed words appear immediately (not after draining old cache)

**Example:**
- Change `THEME = "anything"` → `THEME = "cooking"`
- Next widget refresh clears cache
- Fetches 50 cooking-related words
- User sees immediate theme change

## LLM Prompt Strategy

### Batch Request Format

The system requests an **array of word objects** in a single API call:

```javascript
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [
    {
      "role": "system",
      "content": "You are a Random Word API. Generate 50 UNIQUE random English words..."
    },
    {
      "role": "user",
      "content": "Generate 50 unique words with translations for the theme \"anything\"."
    }
  ],
  "temperature": 1
}
```

### Response Validation

1. Parse JSON response (expect array)
2. Validate array structure
3. Filter each word object:
   - Must have `word`, `definition`, `translations`
   - Skip invalid entries
4. Ensure at least some valid words returned
5. Log warnings for skipped entries

**Defensive:** Even if LLM returns 45/50 valid words, the system works fine.

## Configuration Reference

### Batch & Rotation Settings

```javascript
// Cache file
const CACHE_FILE = "word_cache.json";

// Rotation interval (how often to show new word)
const WORD_ROTATION_INTERVAL = 5 * 60 * 1000; // 5 min (testing)
// Production: 60 * 60 * 1000 (1 hour)

// Batch size (words per API call)
const BATCH_SIZE = 50;

// Minimum cache threshold (trigger new fetch)
const MIN_CACHE_THRESHOLD = 10;

// Deduplication TTL
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
```

### Provider Configuration

```javascript
const ACTIVE_PROVIDER = "gemini"; // or "openai"

const PROVIDER_CONFIG = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.1-flash-lite-preview", // Free tier, translation-optimized
    apiKey: getEnv("GEMINI_API_KEY")
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: getEnv("OPENAI_API_KEY")
  }
};
```

## Key Functions

### Cache Management
- `createEmptyCache()` - Initialize new cache structure
- `loadWordCache()` - Load from disk, validate structure
- `saveWordCache(cache)` - Apply TTL filter, write to disk

### History & Deduplication
- `deriveWordId(word)` - Normalize word for comparison (lowercase, trimmed)
- `addWordToHistory(cache, wordData)` - Record displayed word with timestamp
- `selectFallbackWord(cache)` - Get word for offline/error display

### Batch Fetching
- `buildBatchPrompt(count, excludeWords, theme)` - Build LLM prompt for array response
- `fetchWordBatch(count, excludeWords, theme)` - Call LLM, parse array, validate
- `callLLM(messages)` - OpenAI-compatible API call with error handling

### Rotation & Display
- `getCurrentWord(cache)` - Get word respecting rotation interval
- `ensureCacheStocked(cache)` - Fetch new batch if below threshold
- `detectThemeChange(cache)` - Clear cache on theme change

### Widget Creation
- `transformLLMResponse(llmResponse)` - Convert LLM format to widget data
- `createWidget(data)` - Build Scriptable widget UI
- `createErrorWidget(message, details)` - User-friendly error display

## Testing Recommendations

### Initial Testing (5-minute rotation)
1. Set `WORD_ROTATION_INTERVAL = 5 * 60 * 1000`
2. Run widget, verify first batch fetch
3. Wait 5 minutes, refresh → should show new word
4. Check logs: "Rotation interval elapsed..."
5. Verify cache file exists and has 50 words

### Production Testing (1-hour rotation)
1. Change to `WORD_ROTATION_INTERVAL = 60 * 60 * 1000`
2. Verify word stays stable across multiple widget refreshes
3. After 1 hour, verify word advances
4. Monitor batch refetch frequency (~25 days)

### Theme Change Testing
1. Set `THEME = "technology"`
2. Verify cache clears and new themed words appear
3. Check logs: "Theme changed from... Clearing cache"

### Error Testing
1. Remove API key → Should show "Configuration needed"
2. Disable internet → Should show cached word + retry message
3. Invalid API key → Should show helpful error

## Comparison: Single vs Batch Mode

| Aspect | Single-Word Mode (Old) | Batch Mode (New) |
|--------|------------------------|------------------|
| API calls/month (1h rotation) | ~720 | ~2 |
| API calls/month (5min rotation) | ~8,640 | ~180 |
| Cost reduction | - | **~98%** |
| Offline resilience | 1 cached word | 50 cached words |
| Deduplication | Last N words | TTL-based (24h) |
| Cache complexity | Simple | Moderate |
| Word variety | High (every fetch) | High (50-word batch) |
| Response time | 1-2s per fetch | 2-3s per batch (rare) |
| Risk of repetition | Low | Very low |
| Theme change effect | Slow (natural drain) | Immediate (cache clear) |

## Migration from Old Script

**No backwards compatibility!** The new cache structure is incompatible with old `recent_words.json`.

**Migration steps:**
1. Replace `script_llm.js` with new version
2. Old `recent_words.json` will be ignored
3. New `word_cache.json` will be created on first run
4. No data migration needed (fresh start)

**Optional cleanup:**
- Delete old `recent_words.json` from Scriptable Documents directory (not required)

## Troubleshooting

### Widget shows old word after rotation interval
- Check widget refresh frequency (iOS decides when to refresh)
- Manually refresh widget to trigger rotation check
- Verify `current_word_timestamp` in cache file

### Same words repeating within 24 hours
- Check `history` array in cache file
- Verify TTL filter is working (timestamps within 24h)
- Increase `BATCH_SIZE` for more variety

### Frequent API calls (battery/cost concern)
- Check `BATCH_SIZE` is 50 (not too low)
- Verify `MIN_CACHE_THRESHOLD` is appropriate (10 is good balance)
- Check cache file isn't being deleted/corrupted

### Theme change not taking effect
- Verify `THEME` constant changed in script
- Check logs for "Theme changed from..." message
- Manually refresh widget

### Error: "No words available in cache after stocking attempt"
- API error prevented batch fetch
- Check internet connection
- Verify API key is set correctly
- Check LLM provider status

## Future Enhancements

Potential improvements for consideration:

1. **Smart rotation**: Adjust interval based on time of day (slower at night)
2. **Difficulty levels**: Add easy/medium/hard word selection
3. **Favorites**: Star words to exclude from rotation
4. **Statistics**: Track words learned over time
5. **Pronunciation**: Add audio URL field for each word
6. **Example sentences**: Request usage examples from LLM
7. **Multi-theme**: Blend multiple themes in one batch
8. **Progressive difficulty**: Gradually increase word complexity

## Performance Characteristics

**Memory footprint:**
- Cache file: ~50KB (50 words with translations)
- History: ~2-10KB (depends on rotation frequency)
- Total: **< 100KB storage**

**Network usage:**
- Batch fetch: ~2-5KB request, ~20-50KB response
- Frequency: Once per ~25 days (1h rotation) or ~4 hours (5min rotation)
- Total: **< 1MB/month**

**Battery impact:**
- Widget refresh: Minimal (read from cache)
- API call: Brief network activity
- Overall: **Negligible** (refreshes are infrequent)

## Conclusion

The batch mode architecture provides:
- ✅ **98% cost reduction** vs single-word mode
- ✅ **Excellent offline resilience** (50-word cache)
- ✅ **Stable rotation** (word doesn't flicker on refreshes)
- ✅ **Smart deduplication** (TTL-based, 24-hour window)
- ✅ **Theme flexibility** (immediate effect on changes)
- ✅ **Robust error handling** (fallbacks + helpful messages)
- ✅ **Minimal resource usage** (storage, network, battery)

Perfect for daily vocabulary learning with high word variety and low operational cost.
