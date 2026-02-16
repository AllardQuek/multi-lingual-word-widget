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
// ========================================

// Build LANGS array from user configuration
const LANGS = [
  { code: "en", label: "EN" },
  ...USER_LANGUAGE_CODES.map(code => ({
    code: code,
    label: code.toUpperCase()
  }))
];

// Fetch word data from Elastic tool
async function fetchWordFromElastic() {
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
      tool_params: {}
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
    
    // Fetch word data from Elastic
    const elasticResponse = await fetchWordFromElastic();
    
    // Transform response to widget data format
    const data = transformElasticResponse(elasticResponse);
    
    // Validate we have some data
    if (!data.word && !data.translations.en) {
      throw new Error("No word data received from Elastic tool");
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
