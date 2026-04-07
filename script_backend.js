// Backend-powered multilingual vocabulary widget
// Fetches random words and translations from a deployed backend /api/word endpoint

// ========== USER-FACING CONFIGURATION ==========
// Keep common user-editable settings here for easier discovery.
// - Script defaults to the deployed Render backend URL below.

// Backend API Configuration
const BACKEND_API_URL = "https://multi-lingual-word-widget.onrender.com";
const BACKEND_TIMEOUT_MS = 15000;

// ========== BATCHING & ROTATION CONFIGURATION ==========
// Cache file name (Scriptable Documents or repo root)
const CACHE_FILE = "word_cache.json";

// Word rotation interval (how often to show a new word)
const WORD_ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes (testing) - change to 60 * 60 * 1000 for 1 hour

// Batch size (how many words to fetch in one API call)
const BATCH_SIZE = 50;

// Minimum cache threshold (fetch new batch when this low)
const MIN_CACHE_THRESHOLD = 10;

// Deduplication TTL (repeats allowed after this time)
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// Toggle QuickLook display when running interactively in Scriptable. May have issues on MacOS.
const ENABLE_QUICKLOOK = false;

// Optional theme/topic for generation — edit the `THEME` variable below to customize.
const THEME = "anything";

// Language configuration: single list that contains each supported language,
// its human-friendly name, and whether it should be included in translations.
// Edit `include: true` to enable a language for translation/display.
const LANG_CONFIG = [
  { code: "de", name: "German", include: true },
  { code: "id", name: "Indonesian", include: true },
  { code: "km", name: "Khmer", include: true },
  { code: "vi", name: "Vietnamese", include: true },
  { code: "ar", name: "Arabic", include: false },
  { code: "yue", name: "Cantonese", include: false },
  { code: "nl", name: "Dutch", include: false },
  { code: "fr", name: "French", include: false },
  { code: "el", name: "Greek", include: false },
  { code: "he", name: "Hebrew", include: false },
  { code: "hi", name: "Hindi", include: false },
  { code: "it", name: "Italian", include: false },
  { code: "ja", name: "Japanese", include: false },
  { code: "ko", name: "Korean", include: false },
  { code: "zh", name: "Mandarin", include: false },
  { code: "pl", name: "Polish", include: false },
  { code: "pt", name: "Portuguese", include: false },
  { code: "ru", name: "Russian", include: false },
  { code: "es", name: "Spanish", include: false },
  { code: "sw", name: "Swahili", include: false },
  { code: "tl", name: "Tagalog", include: false },
  { code: "th", name: "Thai", include: false },
  { code: "tr", name: "Turkish", include: false }
];

// NOTE: change `include` booleans above to configure which languages are used.


// ================================================

// Build LANGS array from user configuration
const LANGS = [
  { code: "en", label: "EN" },
  ...LANG_CONFIG.filter(l => l.include).map(l => ({ code: l.code, label: l.code.toUpperCase() }))
];

const isScriptable = (typeof FileManager !== 'undefined');
const isNode = (typeof process !== 'undefined' && process.versions && process.versions.node);
const fm = isScriptable ? FileManager.local() : null;

// Log documents directory only if in Scriptable
if (isScriptable && fm) {
  console.log('Documents directory:', fm.documentsDirectory());
}

let cachePath = null;
let nodeFs = null;
let nodePathModule = null;
if (isScriptable) {
  cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
} else if (isNode) {
  nodeFs = require('fs');
  nodePathModule = require('path');
  cachePath = nodePathModule.join(process.cwd(), CACHE_FILE);
}

// ========== CACHE MANAGEMENT ==========

// Create empty cache structure
function createEmptyCache() {
  const cache = {
    currentTheme: THEME,
    themes: {}
  };
  cache.themes[THEME] = {
    current_word_index: 0,
    current_word_timestamp: 0,
    batch: [],
    history: [],
    last_used: Date.now()
  };
  return cache;
}

// Load word cache from disk
function loadWordCache() {
  try {
    let raw = null;
    if (isScriptable) {
      if (!fm.fileExists(cachePath)) return createEmptyCache();
      raw = fm.readString(cachePath);
    } else if (isNode) {
      if (!nodeFs.existsSync(cachePath)) return createEmptyCache();
      raw = nodeFs.readFileSync(cachePath, 'utf8');
    }

    if (!raw) return createEmptyCache();
    const parsed = JSON.parse(raw);
    
    // Check if it's the old flat structure and migrate
    if (parsed.batch && Array.isArray(parsed.batch)) {
      console.log('Migrating old cache format to multi-theme format');
      const oldTheme = parsed.theme || THEME;
      const newCache = {
        currentTheme: oldTheme,
        themes: {}
      };
      newCache.themes[oldTheme] = {
        current_word_index: parsed.current_word_index || 0,
        current_word_timestamp: parsed.current_word_timestamp || 0,
        batch: parsed.batch || [],
        history: parsed.history || [],
        last_used: Date.now()
      };
      return newCache;
    }
    
    // Validate new structure
    if (!parsed.themes || typeof parsed.themes !== 'object') {
      console.log('Invalid cache structure, starting fresh');
      return createEmptyCache();
    }
    
    return parsed;
  } catch (e) {
    console.log('Failed to load cache:', e);
    return createEmptyCache();
  }
}

// Save word cache to disk
function saveWordCache(cache) {
  try {
    const now = Date.now();
    
    // Clean history for all themes and prune themes
    const MAX_THEMES = 5;
    const themeNames = Object.keys(cache.themes);
    
    // Set current theme last_used
    if (cache.themes[cache.currentTheme]) {
        cache.themes[cache.currentTheme].last_used = now;
    }
    
    if (themeNames.length > MAX_THEMES) {
      // Sort by last_used descending
      themeNames.sort((a, b) => (cache.themes[b].last_used || 0) - (cache.themes[a].last_used || 0));
      
      // Keep only top MAX_THEMES
      for (let i = MAX_THEMES; i < themeNames.length; i++) {
        const themeToRemove = themeNames[i];
        if (themeToRemove !== cache.currentTheme) {
          console.log(`Pruning old theme from cache: "${themeToRemove}"`);
          delete cache.themes[themeToRemove];
        }
      }
    }
    
    for (const theme of Object.keys(cache.themes)) {
      if (cache.themes[theme] && cache.themes[theme].history) {
        cache.themes[theme].history = cache.themes[theme].history.filter(h => (now - (h.ts || 0)) <= DEDUP_TTL_MS);
      }
    }
    
    const s = JSON.stringify(cache, null, 2);
    if (isScriptable && fm) {
      fm.writeString(cachePath, s);
    } else if (isNode) {
      nodeFs.writeFileSync(cachePath, s, 'utf8');
    }
  } catch (e) {
    console.log('Failed to save cache:', e);
  }
}

// ========== WORD ID & HISTORY MANAGEMENT ==========

// Simple id decision:
// Derive a small identifier for local deduplication by lowercasing and trimming the word.
function deriveWordId(word) {
  if (!word) return "";
  return word.toString().trim().toLowerCase();
}

// Add word to history for deduplication
function addWordToHistory(cache, wordData) {
  if (!wordData || !wordData.word) return;
  
  const wordId = deriveWordId(wordData.word);
  if (!wordId) return;
  
  // Remove if already in history
  const themeCache = cache.themes[cache.currentTheme];
  if (!themeCache) return;
  
  themeCache.history = themeCache.history.filter(h => h.id !== wordId);
  
  // Add to front with timestamp
  themeCache.history.unshift({
    id: wordId,
    ts: Date.now()
  });
  
  console.log(`Added "${wordData.word}" to history (${themeCache.history.length} total)`);
}

// Get fallback word from cache for offline/error display
function selectFallbackWord(cache) {
  try {
    const themeCache = cache.themes[cache.currentTheme];
    if (!themeCache || !themeCache.batch || themeCache.batch.length === 0) {
      return null;
    }
    
    // Use current word if available
    if (themeCache.current_word_index < themeCache.batch.length) {
      return themeCache.batch[themeCache.current_word_index];
    }
    
    // Otherwise, use first word in batch
    return themeCache.batch[0];
  } catch (e) {
    console.log('Failed to select fallback word:', e);
    return null;
  }
}

// ========== BATCH FETCHING (BACKEND API) ==========

function getBackendEndpoint() {
  return `${BACKEND_API_URL.replace(/\/+$/, "")}/api/word`;
}

// Fetch multiple words in one API call
async function fetchWordBatch(count, excludeWords, theme) {
  try {
    const endpoint = getBackendEndpoint();

    const req = new Request(endpoint);
    req.method = "POST";
    req.timeoutInterval = Math.floor(BACKEND_TIMEOUT_MS / 1000);
    req.headers = {
      "Content-Type": "application/json"
    };

    req.body = JSON.stringify({
      count,
      theme
    });

    console.log(`Fetching backend batch of ${count} words...`);
    console.log(`Local history entries (client-side dedup): ${excludeWords.length}`);
    console.log(`Theme: ${theme}`);
    console.log(`Backend URL: ${endpoint}`);

    const responseJson = await req.loadJSON();

    if (!Array.isArray(responseJson)) {
      const errorMessage = responseJson && responseJson.error
        ? JSON.stringify(responseJson.error)
        : "Backend did not return a JSON array";
      throw new Error(errorMessage);
    }

    console.log(`Received ${responseJson.length} words from backend`);

    const validWords = responseJson.filter(w => {
      if (!w || typeof w !== 'object') return false;
      if (!w.word || !w.definition || !w.translations) {
        console.warn(`Skipping invalid word: ${JSON.stringify(w)}`);
        return false;
      }
      return true;
    });

    if (validWords.length === 0) {
      throw new Error('No valid words in backend batch response');
    }

    console.log(`${validWords.length} valid words after filtering`);
    return validWords;
  } catch (error) {
    console.error("Error fetching word batch from backend:", error);
    console.error("Error details:", error.message);
    throw new Error(`Failed to fetch word batch: ${error.message}`);
  }
}

// ========== WORD ROTATION & CACHE MANAGEMENT ==========

// Get current word based on rotation interval
function getCurrentWord(cache) {
  const now = Date.now();
  const themeCache = cache.themes[cache.currentTheme];
  
  // Check if batch is empty
  if (!themeCache || !themeCache.batch || themeCache.batch.length === 0) {
    console.log('Cache batch is empty, need to fetch words');
    return null;
  }
  
  // Check if we need to rotate to next word
  const timeSinceRotation = now - themeCache.current_word_timestamp;
  if (timeSinceRotation >= WORD_ROTATION_INTERVAL) {
    console.log(`Rotation interval elapsed (${Math.floor(timeSinceRotation / 1000)}s), advancing to next word`);
    
    // Advance to next word
    themeCache.current_word_index++;
    themeCache.current_word_timestamp = now;
    
    // Wrap around if we've exhausted batch
    if (themeCache.current_word_index >= themeCache.batch.length) {
      console.log('Reached end of batch, wrapping to start');
      themeCache.current_word_index = 0;
    }
    
    console.log(`Now showing word ${themeCache.current_word_index + 1} of ${themeCache.batch.length}`);
  } else {
    console.log(`Still within rotation interval, showing same word (${Math.floor(timeSinceRotation / 1000)}s elapsed)`);
  }
  
  // Return current word
  return themeCache.batch[themeCache.current_word_index];
}

// Ensure cache has enough words, fetch new batch if needed
async function ensureCacheStocked(cache) {
  let themeCache = cache.themes[cache.currentTheme];
  if (!themeCache) {
    detectThemeChange(cache);
    themeCache = cache.themes[cache.currentTheme];
  }
  
  const currentSize = themeCache.batch ? themeCache.batch.length : 0;
  
  if (currentSize >= MIN_CACHE_THRESHOLD) {
    console.log(`Cache OK: ${currentSize} words available`);
    return;
  }
  
  console.log(`Cache low (${currentSize} words), fetching new batch...`);
  
  // Get history IDs for deduplication
  const excludeWords = themeCache.history ? themeCache.history.map(h => h.id) : [];
  
  // Fetch new batch
  const newWords = await fetchWordBatch(BATCH_SIZE, excludeWords, cache.currentTheme);
  
  // Append to existing batch (don't waste remaining words)
  if (!themeCache.batch) {
    themeCache.batch = [];
  }
  themeCache.batch.push(...newWords);
  
  console.log(`Cache restocked. Now have ${themeCache.batch.length} words.`);
}

// Detect theme change and clear cache if needed
function detectThemeChange(cache) {
  if (cache.currentTheme !== THEME) {
    console.log(`Theme changed from "${cache.currentTheme}" to "${THEME}". Changing active theme bucket.`);
    cache.currentTheme = THEME;
  }
  
  if (!cache.themes[THEME]) {
    cache.themes[THEME] = {
      current_word_index: 0,
      current_word_timestamp: 0,
      batch: [],
      history: [],
      last_used: Date.now()
    };
    return true;
  }
  
  return false;
}

// Transform LLM response to widget data format
function transformLLMResponse(llmResponse) {
  const data = {
    id: null,
    word: "",
    concept: "No definition available",
    difficulty: "",
    translations: {}
  };
  
  // Initialize all languages as not found
  for (const lang of LANGS) {
    data.translations[lang.code] = null;
  }
  
  try {
    // LLM response is direct JSON: {word, definition, translations}
    if (!llmResponse || typeof llmResponse !== 'object') {
      throw new Error("Invalid LLM response format");
    }
    
    // Extract word
    if (llmResponse.word) {
      data.word = llmResponse.word;
      data.translations.en = llmResponse.word;
    }

    // Extract id if provided, otherwise derive from word
    if (llmResponse.id) {
      data.id = llmResponse.id.toString();
    } else if (data.word) {
      data.id = deriveWordId(data.word);
    }
    
    // Extract definition
    if (llmResponse.definition) {
      data.concept = llmResponse.definition;
    }
    
    // Map translations from the output
    if (llmResponse.translations) {
      for (const [langCode, translation] of Object.entries(llmResponse.translations)) {
        if (data.translations.hasOwnProperty(langCode)) {
          data.translations[langCode] = translation;
        }
      }
    }
    
  } catch (error) {
    console.error("Error transforming LLM response:", error);
    throw error;
  }
  
  return data;
}

// Create error widget
function createErrorWidget(message, details = null) {
  let widget = new ListWidget();
  widget.backgroundColor = new Color("#111827");
  widget.setPadding(10, 10, 10, 10);
  
  let errorText = widget.addText("⚠️ Error");
  errorText.font = Font.boldSystemFont(14);
  errorText.textColor = new Color("#EF4444");
  
  widget.addSpacer(4);
  
  let messageText = widget.addText(message);
  messageText.font = Font.systemFont(12);
  messageText.textColor = Color.gray();
  messageText.minimumScaleFactor = 0.7;
  
  if (details) {
    widget.addSpacer(4);
    let detailsText = widget.addText(details);
    detailsText.font = Font.systemFont(10);
    detailsText.textColor = new Color("#9CA3AF");
    detailsText.minimumScaleFactor = 0.6;
  }
  
  return widget;
}

// Add language row to widget
function addLangRow(lang, value, widget, fontSize) {
  let row = widget.addStack();
  row.layoutHorizontally();

  let labelText = row.addText(`${lang.label}: `);
  labelText.font = Font.systemFont(fontSize);
  labelText.textColor = Color.gray();
  labelText.minimumScaleFactor = 0.7;
  labelText.lineLimit = 1;

  let displayValue = value || "not found";
  let wordText = row.addText(displayValue);
  wordText.font = Font.systemFont(fontSize);
  wordText.textColor = value ? Color.white() : new Color("#6B7280");
  wordText.minimumScaleFactor = 0.7;
  wordText.lineLimit = 1;
}

// Create widget with data
function createWidget(data) {
  let widget = new ListWidget();
  widget.backgroundColor = new Color("#111827");
  const fam = config.widgetFamily;

  if (fam === "accessoryRectangular") {
    widget.setPadding(4, 8, 4, 8);
    const rowFontSize = 13;
    
    for (const lang of LANGS) {
      addLangRow(lang, data.translations[lang.code], widget, rowFontSize);
    }
  } else {
    widget.setPadding(6, 10, 6, 10);

    let conceptText = widget.addText(data.concept);
    conceptText.font = Font.systemFont(14);
    conceptText.textColor = Color.gray();
    conceptText.minimumScaleFactor = 0.8;
    conceptText.lineLimit = 3;

    widget.addSpacer(4);

    const rowFontSize = 16;
    for (const lang of LANGS) {
      addLangRow(lang, data.translations[lang.code], widget, rowFontSize);
    }
  }
  
  return widget;
}

// ========== MAIN EXECUTION ==========

async function main() {
  try {
    console.log('=== Widget Refresh Started ===');
    console.log('Cache path:', cachePath);
    
    // Load cache
    const cache = loadWordCache();
    
    // Check for theme change and create new storage if needed
    detectThemeChange(cache);
    
    const themeCache = cache.themes[cache.currentTheme];
    console.log(`Loaded cache for theme "${cache.currentTheme}": ${themeCache.batch.length} words, index ${themeCache.current_word_index}`);
    
    // Ensure we have words in cache (fetch if needed)
    await ensureCacheStocked(cache);
    
    // Get current word (respects rotation interval)
    const wordData = getCurrentWord(cache);
    
    if (!wordData) {
      throw new Error("No words available in cache after stocking attempt");
    }
    
    console.log(`Displaying word: "${wordData.word}"`);
    
    // Add to history for deduplication
    addWordToHistory(cache, wordData);
    
    // Save cache
    saveWordCache(cache);
    
    // Transform to widget format
    const data = transformLLMResponse(wordData);
    
    // Create and display widget
    const widget = createWidget(data);
    
    if (config.runsInAccessoryWidget || config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      await widget.presentSmall();
    }
    
    console.log('=== Widget Refresh Complete ===');
  } catch (error) {
    console.error("=== Main Error ===");
    console.error(error);
    
    // Try to show fallback word from cache
    const cache = loadWordCache();
    const fallbackWord = selectFallbackWord(cache);
    
    if (fallbackWord) {
      console.log(`Using fallback word from cache: "${fallbackWord.word}"`);
      const data = transformLLMResponse(fallbackWord);
      const widget = createWidget(data);
      
      // Retry on next refresh
      widget.refreshAfterDate = new Date();
      
      if (config.runsInAccessoryWidget || config.runsInWidget) {
        Script.setWidget(widget);
      } else {
        await widget.presentSmall();
      }
    } else {
      // No fallback available, show error
      console.log('No fallback available, showing error widget');
      
      let userMessage = "Unable to fetch words";
      let userDetails = "Check internet connection and backend service";
      userDetails = `Check backend service: ${BACKEND_API_URL}`;
      
      const errorWidget = createErrorWidget(userMessage, userDetails);
      errorWidget.refreshAfterDate = new Date();
      
      if (config.runsInAccessoryWidget || config.runsInWidget) {
        Script.setWidget(errorWidget);
      } else {
        await errorWidget.presentSmall();
      }
    }
  }
  
  Script.complete();
}

// Run the script
await main();
