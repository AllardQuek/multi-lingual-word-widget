// LLM-powered multilingual vocabulary widget
// Fetches random words and translations using direct LLM API calls (Gemini, OpenAI, etc.)

// ========== USER CONFIGURATION ==========
// Elastic API Configuration
// Helper to read environment values in Scriptable (Keychain) or Node (process.env)
function getEnv(name) {
  try {
    if (typeof Keychain !== 'undefined' && Keychain.contains(name)) {
      return Keychain.get(name);
    }
  } catch (e) {
    // Keychain may not be defined outside Scriptable; ignore
  }

  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }

  if (typeof globalThis !== 'undefined' && globalThis[name]) {
    return globalThis[name];
  }

  return "";
}

// ========== USER-FACING CONFIGURATION ==========
// Keep common user-editable settings here for easier discovery.
// - API keys are read via Keychain or environment using `getEnv()`.
// - Tweak these to change local dedup behaviour and interactive debugging.

// LLM Provider Configuration
// Switch between providers by changing ACTIVE_PROVIDER
const ACTIVE_PROVIDER = "gemini"; // "gemini" or "openai"

const PROVIDER_CONFIG = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.1-flash-lite-preview", // Optimized for translation tasks
    apiKey: getEnv("GEMINI_API_KEY")
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: getEnv("OPENAI_API_KEY")
  }
};

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
  return {
    current_word_index: 0,
    current_word_timestamp: 0,
    theme: THEME,
    batch: [],
    history: []
  };
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
    
    // Validate structure
    if (!parsed.batch || !Array.isArray(parsed.batch)) {
      console.log('Invalid cache structure, starting fresh');
      return createEmptyCache();
    }
    
    return {
      current_word_index: parsed.current_word_index || 0,
      current_word_timestamp: parsed.current_word_timestamp || 0,
      theme: parsed.theme || THEME,
      batch: parsed.batch || [],
      history: parsed.history || []
    };
  } catch (e) {
    console.log('Failed to load cache:', e);
    return createEmptyCache();
  }
}

// Save word cache to disk
function saveWordCache(cache) {
  try {
    // Clean history (apply TTL filter only)
    const now = Date.now();
    cache.history = cache.history.filter(h => (now - (h.ts || 0)) <= DEDUP_TTL_MS);
    
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
  cache.history = cache.history.filter(h => h.id !== wordId);
  
  // Add to front with timestamp
  cache.history.unshift({
    id: wordId,
    ts: Date.now()
  });
  
  console.log(`Added "${wordData.word}" to history (${cache.history.length} total)`);
}

// Get fallback word from cache for offline/error display
function selectFallbackWord(cache) {
  try {
    if (!cache.batch || cache.batch.length === 0) {
      return null;
    }
    
    // Use current word if available
    if (cache.current_word_index < cache.batch.length) {
      return cache.batch[cache.current_word_index];
    }
    
    // Otherwise, use first word in batch
    return cache.batch[0];
  } catch (e) {
    console.log('Failed to select fallback word:', e);
    return null;
  }
}

// ========== LLM PROMPT BUILDING ==========

// Build prompt for batch word generation
function buildBatchPrompt(count, excludeWords, theme) {
  const excludeList = excludeWords.length > 0 ? JSON.stringify(excludeWords) : "[]";
  const selectedLangs = LANG_CONFIG.filter(l => l.include);
  const languageCodesList = JSON.stringify(selectedLangs.map(l => `${l.name} (${l.code})`));
  
  const systemPrompt = `You are a Random Word API. Generate ${count} UNIQUE random English words with translations.

Rules:
1. Return an ARRAY of ${count} word objects
2. Each word should be intermediate difficulty, suitable for language learning
3. DO NOT include these recent words: ${excludeList}
4. Theme: ${theme}
5. Translate each word into: ${languageCodesList}
6. For non-Latin scripts (ar, el, he, hi, ja, km, ko, ru, th, yue, zh): romanization FIRST, then native script in parentheses
7. Keep definitions under 50 characters
8. Sort translations alphabetically by language code

Return format (JSON array):
[
  {
    "word": "example",
    "definition": "a representative sample",
    "translations": {
      "de": "Beispiel",
      "id": "contoh",
      "km": "kaa chom rol (ការជំរល)",
      "vi": "ví dụ"
    }
  }
]

IMPORTANT: Return ONLY the JSON array, no markdown, no code blocks, no explanations.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate ${count} unique words with translations for the theme "${theme}".` }
  ];
}

// Call LLM using OpenAI-compatible API
async function callLLM(messages) {
  const provider = PROVIDER_CONFIG[ACTIVE_PROVIDER];
  
  if (!provider || !provider.apiKey) {
    throw new Error(`Missing API key for provider: ${ACTIVE_PROVIDER}. Set ${ACTIVE_PROVIDER.toUpperCase()}_API_KEY in your environment.`);
  }
  
  const req = new Request(`${provider.baseURL}/chat/completions`);
  req.method = "POST";
  req.headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${provider.apiKey}`
  };
  req.body = JSON.stringify({
    model: provider.model,
    messages: messages,
    temperature: 1
  });
  
  console.log(`Calling ${ACTIVE_PROVIDER} with model ${provider.model}...`);
  console.log(`API Key present: ${provider.apiKey ? 'YES (length: ' + provider.apiKey.length + ')' : 'NO'}`);
  console.log(`Request URL: ${provider.baseURL}/chat/completions`);
  
  const response = await req.loadJSON();
  console.log(`Response received. Type: ${typeof response}`);
  
  // Log error responses from API
  if (response && response.error) {
    console.error(`API Error: ${JSON.stringify(response.error)}`);
    throw new Error(`API returned error: ${response.error.message || JSON.stringify(response.error)}`);
  }
  
  if (!response || !response.choices || response.choices.length === 0) {
    console.error(`Invalid response structure: ${JSON.stringify(response)}`);
    throw new Error("Invalid response from LLM - no choices in response");
  }
  
  const content = response.choices[0].message.content;
  console.log(`LLM raw response: ${content.substring(0, 200)}...`);
  
  return content;
}

// ========== BATCH FETCHING ==========

// Fetch multiple words in one API call
async function fetchWordBatch(count, excludeWords, theme) {
  try {
    const provider = PROVIDER_CONFIG[ACTIVE_PROVIDER];
    if (!provider || !provider.apiKey) {
      throw new Error(`Missing LLM API configuration. Set ${ACTIVE_PROVIDER.toUpperCase()}_API_KEY in your environment (Keychain or process.env)`);
    }

    // Build prompt for batch
    const messages = buildBatchPrompt(count, excludeWords, theme);
    
    console.log(`Fetching batch of ${count} words...`);
    console.log(`Excluding ${excludeWords.length} recent words`);
    console.log(`Theme: ${theme}`);
    
    // Call LLM
    const responseContent = await callLLM(messages);
    
    // Parse JSON response - expect array
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', responseContent.substring(0, 200));
      throw new Error(`Invalid JSON from LLM: ${parseError.message}`);
    }
    
    // Validate it's an array
    if (!Array.isArray(parsedResponse)) {
      console.error('Expected array from LLM, got:', typeof parsedResponse);
      throw new Error('LLM did not return an array of words');
    }
    
    console.log(`Received ${parsedResponse.length} words in batch`);
    
    // Validate each word has required fields
    const validWords = parsedResponse.filter(w => {
      if (!w || typeof w !== 'object') return false;
      if (!w.word || !w.definition || !w.translations) {
        console.warn(`Skipping invalid word: ${JSON.stringify(w)}`);
        return false;
      }
      return true;
    });
    
    if (validWords.length === 0) {
      throw new Error('No valid words in batch response');
    }
    
    console.log(`${validWords.length} valid words after filtering`);
    return validWords;
  } catch (error) {
    console.error("Error fetching word batch:", error);
    console.error("Error details:", error.message);
    console.error("Error stack:", error.stack);
    throw new Error(`Failed to fetch word batch: ${error.message}`);
  }
}

// ========== WORD ROTATION & CACHE MANAGEMENT ==========

// Get current word based on rotation interval
function getCurrentWord(cache) {
  const now = Date.now();
  
  // Check if batch is empty
  if (!cache.batch || cache.batch.length === 0) {
    console.log('Cache batch is empty, need to fetch words');
    return null;
  }
  
  // Check if we need to rotate to next word
  const timeSinceRotation = now - cache.current_word_timestamp;
  if (timeSinceRotation >= WORD_ROTATION_INTERVAL) {
    console.log(`Rotation interval elapsed (${Math.floor(timeSinceRotation / 1000)}s), advancing to next word`);
    
    // Advance to next word
    cache.current_word_index++;
    cache.current_word_timestamp = now;
    
    // Wrap around if we've exhausted batch
    if (cache.current_word_index >= cache.batch.length) {
      console.log('Reached end of batch, wrapping to start');
      cache.current_word_index = 0;
    }
    
    console.log(`Now showing word ${cache.current_word_index + 1} of ${cache.batch.length}`);
  } else {
    console.log(`Still within rotation interval, showing same word (${Math.floor(timeSinceRotation / 1000)}s elapsed)`);
  }
  
  // Return current word
  return cache.batch[cache.current_word_index];
}

// Ensure cache has enough words, fetch new batch if needed
async function ensureCacheStocked(cache) {
  const currentSize = cache.batch ? cache.batch.length : 0;
  
  if (currentSize >= MIN_CACHE_THRESHOLD) {
    console.log(`Cache OK: ${currentSize} words available`);
    return;
  }
  
  console.log(`Cache low (${currentSize} words), fetching new batch...`);
  
  // Get history IDs for deduplication
  const excludeWords = cache.history ? cache.history.map(h => h.id) : [];
  
  // Fetch new batch
  const newWords = await fetchWordBatch(BATCH_SIZE, excludeWords, cache.theme);
  
  // Append to existing batch (don't waste remaining words)
  if (!cache.batch) {
    cache.batch = [];
  }
  cache.batch.push(...newWords);
  
  console.log(`Cache restocked. Now have ${cache.batch.length} words.`);
}

// Detect theme change and clear cache if needed
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
    console.log(`Loaded cache: ${cache.batch.length} words, index ${cache.current_word_index}, theme "${cache.theme}"`);
    
    // Check for theme change
    detectThemeChange(cache);
    
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
      let userDetails = "Check internet connection and API key";
      
      // Check if it's a configuration issue
      const provider= PROVIDER_CONFIG[ACTIVE_PROVIDER];
      if (!provider || !provider.apiKey) {
        userMessage = "Configuration needed";
        userDetails = `Set ${ACTIVE_PROVIDER.toUpperCase()}_API_KEY in Keychain`;
      }
      
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
