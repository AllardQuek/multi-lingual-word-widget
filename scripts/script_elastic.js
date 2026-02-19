// Elastic-powered multilingual vocabulary widget
// Fetches random words and translations from Elastic Agent Builder tool

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

// Read configuration (preferred: Scriptable Keychain). See .env.example for placeholders.
const ELASTIC_API_URL = getEnv("ELASTIC_API_URL");
const ELASTIC_API_KEY = getEnv("ELASTIC_API_KEY");
const ELASTIC_TOOL_ID = getEnv("ELASTIC_TOOL_ID") || "word.of.the.day.multilingual";

// Customize which languages to display in the widget
// Add the language codes for the languages you want to learn below
// The Elastic agent determines which translations are available
//
// Common language codes:
//   "ar" - Arabic      "de" - German       "es" - Spanish
//   "fr" - French      "hi" - Hindi        "id" - Indonesian
//   "it" - Italian     "ja" - Japanese     "ko" - Korean
//   "nl" - Dutch       "pl" - Polish       "pt" - Portuguese
//   "ru" - Russian     "th" - Thai         "tr" - Turkish
//   "vi" - Vietnamese  "zh" - Chinese (Simplified)
//
const USER_LANGUAGE_CODES = ["de", "id", "vi", "km"];

// NOT NEEDED FOR NOW
// How often the widget should request a refresh (in minutes).
// iOS treats this as a *hint* — it may still delay the actual refresh,
// but without this the system can cache the widget for many hours.
// const REFRESH_INTERVAL_MINUTES = 5;
// ========================================

// Build LANGS array from user configuration
const LANGS = [
  { code: "en", label: "EN" },
  ...USER_LANGUAGE_CODES.map(code => ({
    code: code,
    label: code.toUpperCase()
  }))
];

// Recent words cache (Scriptable FileManager)
// Recent list size: default 3. Set this constant to change behavior.
// (Simpler than using an environment/keychain value.)
const RECENT_MAX = 0;
const RECENT_FILE = "recent_words.json";
const isScriptable = (typeof FileManager !== 'undefined');
const isNode = (typeof process !== 'undefined' && process.versions && process.versions.node);
const fm = isScriptable ? FileManager.local() : null;
console.log(fm.documentsDirectory());

let recentPath = null;
let nodeFs = null;
let nodePathModule = null;
if (isScriptable) {
  recentPath = fm.joinPath(fm.documentsDirectory(), RECENT_FILE);
} else if (isNode) {
  nodeFs = require('fs');
  nodePathModule = require('path');
  recentPath = nodePathModule.join(process.cwd(), RECENT_FILE);
}

function loadRecent() {
  try {
    if (isScriptable) {
      if (!fm.fileExists(recentPath)) return [];
      const s = fm.readString(recentPath);
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr;
    } else if (isNode) {
      if (!nodeFs.existsSync(recentPath)) return [];
      const s = nodeFs.readFileSync(recentPath, 'utf8');
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {
    console.log('Failed to load recent words:', e);
  }
  return [];
}

function saveRecent(list) {
  try {
    if (isScriptable) {
      if (!fm) return;
      fm.writeString(recentPath, JSON.stringify(list));
    } else if (isNode) {
      nodeFs.writeFileSync(recentPath, JSON.stringify(list), 'utf8');
    }
  } catch (e) {
    console.log('Failed to save recent words:', e);
  }
}

// Simple id decision:
// - We keep this intentionally minimal: derive a small identifier used only
//   for local deduplication by lowercasing and trimming the word. We opted
//   not to perform aggressive normalization (diacritics/punctuation) because
//   the LLM is unlikely to return minor spelling variants and we preserve
//   the original `word` for display.
function deriveWordId(word) {
  if (!word) return "";
  return word.toString().trim().toLowerCase();
}

function pushRecentWordId(wordId) {
  if (!wordId || !fm) return;
  wordId = wordId.toString();
  let list = loadRecent();
  list = list.filter(x => x !== wordId);
  list.unshift(wordId);
  // If RECENT_MAX <= 0 then keep unlimited history; otherwise trim to max
  if (RECENT_MAX > 0) {
    list = list.slice(0, RECENT_MAX);
  }
  saveRecent(list);
}

// Fetch word data from Elastic tool
async function fetchWordFromElastic(recentWords = []) {
  try {
    if (!ELASTIC_API_URL || !ELASTIC_API_KEY) {
      throw new Error("Missing Elastic API configuration. Set ELASTIC_API_URL and ELASTIC_API_KEY in your environment (see .env.example)");
    }

    const req = new Request(ELASTIC_API_URL);
    req.method = "POST";
    req.headers = {
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
      "Authorization": `ApiKey ${ELASTIC_API_KEY}`
    };
    req.body = JSON.stringify({
      tool_id: ELASTIC_TOOL_ID,
      tool_params: {
        recent_words: recentWords
      }
    });
    
    console.log("Calling Elastic tool...");
    const response = await req.loadJSON();
    console.log(`Elastic response: ${JSON.stringify(response)}`);

    if (!response) {
      throw new Error("Empty response from Elastic tool");
    }

    return response;
  } catch (error) {
    console.error("Error calling Elastic tool:", error);
    throw new Error(`Failed to fetch data from Elastic: ${error.message}`);
  }
}

// Transform Elastic response to widget data format
function transformElasticResponse(elasticResponse) {
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
    // Parse nested Elastic response structure
    // Response structure: results[0].data.execution.output (JSON string)
    if (!elasticResponse.results || elasticResponse.results.length === 0) {
      throw new Error("No results in Elastic response");
    }
    
    const result = elasticResponse.results[0];
    const executionData = result.data?.execution;
    
    if (!executionData) {
      throw new Error("No execution data in response");
    }
    
    // Check execution status
    if (executionData.status !== "completed") {
      throw new Error(`Execution status: ${executionData.status}`);
    }
    
    // Parse the output JSON string
    const outputStr = executionData.output;
    if (!outputStr) {
      throw new Error("No output in execution data");
    }
    
    const parsedOutput = JSON.parse(outputStr);
    console.log(`Parsed output: ${JSON.stringify(parsedOutput)}`);
    
    // Extract word
    if (parsedOutput.word) {
      data.word = parsedOutput.word;
      data.translations.en = parsedOutput.word;
    }

    // Extract id if provided, otherwise derive from word
    if (parsedOutput.id) {
      data.id = parsedOutput.id.toString();
    } else if (data.word) {
      data.id = deriveWordId(data.word);
    }
    
    // Extract definition
    if (parsedOutput.definition) {
      data.concept = parsedOutput.definition;
    }
    
    // Map translations from the output
    if (parsedOutput.translations) {
      for (const [langCode, translation] of Object.entries(parsedOutput.translations)) {
        if (data.translations.hasOwnProperty(langCode)) {
          data.translations[langCode] = translation;
        }
      }
    }
    
  } catch (error) {
    console.error("Error transforming Elastic response:", error);
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

// Main execution
async function main() {
  let debugInfo = "";
  
  try {
    debugInfo = "Fetching data from Elastic tool...";
    // Load recent words from local cache
    const recent_words = loadRecent();

    // Not logging for some reason
    console.log('recentPath:', recentPath);
    console.log('recent_words:', recent_words);

    // If running interactively in Scriptable (not as a widget), show the
    // recent file contents in QuickLook so it's easy to inspect.
    if (isScriptable) {
      try {
        if (typeof config !== 'undefined' && !config.runsInAccessoryWidget && !config.runsInWidget) {
          try {
            QuickLook.present(JSON.stringify(recent_words, null, 2));
          } catch (e) {
            console.log('QuickLook.present failed:', e);
          }
        }
      } catch (e) {
        console.log('Scriptable debug display error:', e);
      }
    }

    // Fetch word data from Elastic (pass recent_words so the agent can avoid them)
    const elasticResponse = await fetchWordFromElastic(recent_words);
    
    // Transform response to widget data format
    const data = transformElasticResponse(elasticResponse);
    
    // Validate we have some data
    if (!data.word && !data.translations.en) {
      throw new Error("No word data received from Elastic tool");
    }
    
    // Save chosen id to recent cache so next runs exclude it
    if (data.id) {
      pushRecentWordId(data.id);
    }
    
    // Create widget
    const widget = createWidget(data);

    // NOT NEEDED FOR NOW
    // Tell iOS when to refresh — without this the widget can stay cached for hours
    // widget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL_MINUTES * 60 * 1000);

    if (config.runsInAccessoryWidget || config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      await widget.presentSmall();
    }
  } catch (error) {
    console.error("Main error:", error);
    const errorMessage = error.message || "Failed to load word";
    const errorWidget = createErrorWidget(errorMessage, debugInfo);

    // On error, retry immediately so the widget recovers as soon as iOS allows
    errorWidget.refreshAfterDate = new Date();

    if (config.runsInAccessoryWidget || config.runsInWidget) {
      Script.setWidget(errorWidget);
    } else {
      await errorWidget.presentSmall();
    }
  }
  
  Script.complete();
}

// Run the script
await main();
