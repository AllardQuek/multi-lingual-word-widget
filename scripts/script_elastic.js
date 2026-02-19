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

// ========== USER-FACING CONFIGURATION ==========
// Keep common user-editable settings here for easier discovery.
// - API keys / tool id are read via Keychain or environment using `getEnv()`.
// - Tweak these to change local dedup behaviour and interactive debugging.

// Elastic settings (read from Keychain/environment via `getEnv()`): See .env.example for placeholders.
const ELASTIC_API_URL = getEnv("ELASTIC_API_URL");
const ELASTIC_API_KEY = getEnv("ELASTIC_API_KEY");
const ELASTIC_TOOL_ID = getEnv("ELASTIC_TOOL_ID") || "word.of.the.day.multilingual";

// File name used to persist recent ids (Scriptable Documents or repo root)
const RECENT_FILE = "recent_words.json";
// Time-to-live for recent entries (ms). Set to 3600000 for 1 hour. Set <=0 to disable expiry.
const RECENT_TTL_MS = 5 * 60 * 1000;

// Possible alternative to TTL: Recent words cache size (0 = unbounded)
const RECENT_MAX = 0;
// Toggle QuickLook display when running interactively in Scriptable. May have issues on MacOS.
const ENABLE_QUICKLOOK = false;

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

// ================================================

// Build LANGS array from user configuration
const LANGS = [
  { code: "en", label: "EN" },
  ...USER_LANGUAGE_CODES.map(code => ({
    code: code,
    label: code.toUpperCase()
  }))
];

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

// Load recent entries as objects: [{id, ts}, ...]
function loadRecentObjects() {
  try {
    let raw = null;
    if (isScriptable) {
      if (!fm.fileExists(recentPath)) return [];
      raw = fm.readString(recentPath);
    } else if (isNode) {
      if (!nodeFs.existsSync(recentPath)) return [];
      raw = nodeFs.readFileSync(recentPath, 'utf8');
    }

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    let objs = [];

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return [];
      // Expect array of {id, ts} objects. Ignore any other formats.
      objs = parsed
        .filter(o => o && typeof o === 'object' && o.id)
        .map(o => ({ id: o.id, ts: Number(o.ts) || 0 }));
    }

    // Apply TTL expiry if enabled
    if (RECENT_TTL_MS > 0) {
      const now = Date.now();
      objs = objs.filter(o => (now - (o.ts || 0)) <= RECENT_TTL_MS);
    }

    // Persist cleaned list back to disk (self-healing/migration)
    saveRecentObjects(objs);

    return objs;
  } catch (e) {
    console.log('Failed to load recent words:', e);
    return [];
  }
}

function saveRecentObjects(objs) {
  try {
    const s = JSON.stringify(objs);
    if (isScriptable) {
      if (!fm) return;
      fm.writeString(recentPath, s);
    } else if (isNode) {
      nodeFs.writeFileSync(recentPath, s, 'utf8');
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
  if (!wordId) return;
  wordId = wordId.toString();
  let objs = loadRecentObjects();
  // Remove any existing entry for this id
  objs = objs.filter(o => o.id !== wordId);
  // Prepend new entry with timestamp
  objs.unshift({ id: wordId, ts: Date.now() });
  // Trim by RECENT_MAX if enabled (>0)
  if (RECENT_MAX > 0) {
    objs = objs.slice(0, RECENT_MAX);
  }
  saveRecentObjects(objs);
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
    // Load recent entries (objects with timestamps)
    const recent_objects = loadRecentObjects();
    const recent_words = recent_objects.map(o => o.id);

    // Log path and full objects (include raw ts, ISO and a human-readable local time)
    function fmtTimestamp(ts) {
      const d = new Date(ts || 0);
      let local;
      try {
        local = d.toLocaleString();
      } catch (e) {
        local = d.toString();
      }
      let iso;
      try {
        iso = d.toISOString();
      } catch (e) {
        iso = d.toString();
      }
      return { ts: Number(ts) || 0, local, iso };
    }

    console.log('recentPath:', recentPath);
    console.log('recent_objects:', recent_objects.map(o => ({ id: o.id, ...fmtTimestamp(o.ts) })));

    // If running interactively in Scriptable (not as a widget), show the
    // recent file contents in QuickLook with local timestamps for easy inspection.
    if (isScriptable) {
      try {
        if (typeof config !== 'undefined' && !config.runsInAccessoryWidget && !config.runsInWidget) {
          try {
            const display = recent_objects.map(o => ({ id: o.id, ...fmtTimestamp(o.ts) }));
            // Always log the readable display so macOS/Node users see it in console
            if (Array.isArray(display) && display.length > 0) {
              for (let i = 0; i < display.length; i++) {
                const item = display[i] || {};
                // Ensure we have a readable local timestamp; fall back to computing from ts
                let localStr = item.local;
                if (!localStr && item.ts) {
                  try {
                    localStr = new Date(Number(item.ts)).toLocaleString();
                  } catch (e) {
                    localStr = String(item.ts);
                  }
                }
                try {
                  console.log(`recent_display[${i}]: id=${item.id} time=${localStr} item=${JSON.stringify(item)}`);
                } catch (e) {
                  console.log(`recent_display[${i}]: id=${item.id} time=${localStr}`, item);
                }
              }
            } else {
              console.log('recent_display: []');
            }
            // In Scriptable interactive runs, present with QuickLook only if enabled
            if (ENABLE_QUICKLOOK) {
              try {
                QuickLook.present(JSON.stringify(display, null, 2));
              } catch (e) {
                console.log('QuickLook.present failed:', e);
              }
            } else {
              // QuickLook is disabled for less intrusive debugging; logs are above
              // Console logs are visible in Scriptable's console without popups
            }
          } catch (e) {
            console.log('Scriptable debug display error:', e);
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
