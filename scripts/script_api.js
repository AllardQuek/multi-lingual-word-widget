// API-powered multilingual vocabulary widget
// Fetches random words and translations from external APIs

// ========== USER CONFIGURATION ==========
// Customize which languages to display in the widget
// Add or remove language codes from the array below
// 
// Common language codes supported by the API:
//   de = German       es = Spanish      fr = French       it = Italian
//   pt = Portuguese   nl = Dutch        pl = Polish       ru = Russian
//   id = Indonesian   vi = Vietnamese   th = Thai         ms = Malay
//   zh = Chinese      ja = Japanese     ko = Korean       ar = Arabic
//   hi = Hindi        tr = Turkish      sv = Swedish      no = Norwegian
//
const USER_LANGUAGE_CODES = ["de", "id", "vi"];

// Language display labels (customize 2-letter abbreviations if desired)
// DO NOT DELETE ENTRIES - this is a reference map showing available language codes
// You can edit the labels (e.g., "DE" -> "Ger") but keep all entries for reference
const LANGUAGE_LABELS = {
  de: "DE", es: "ES", fr: "FR", it: "IT", pt: "PT", nl: "NL",
  pl: "PL", ru: "RU", id: "ID", vi: "VI", th: "TH", ms: "MS",
  zh: "ZH", ja: "JA", ko: "KO", ar: "AR", hi: "HI", tr: "TR",
  sv: "SV", no: "NO"
};
// ========================================

// Base URL - we'll fetch multiple words at once to find one with good translations
const RANDOM_WORD_API = "https://random-word-api.herokuapp.com/word";
const TRANSLATION_API_BASE = "https://freedictionaryapi.com/api/v1/entries/en/";
const WORDS_TO_FETCH = 5; // Fetch multiple words to avoid inflected forms without translations

// Build LANGS array from user configuration
const LANGS = [
  { code: "en", label: "EN" },
  ...USER_LANGUAGE_CODES.map(code => ({
    code: code,
    label: LANGUAGE_LABELS[code] || code.toUpperCase()
  }))
];

// Fetch multiple random words from API
async function fetchRandomWords() {
  try {
    // Randomly choose difficulty 1-2 (easy to medium-easy) for better translation coverage
    // const difficulty = Math.floor(Math.random() * 2) + 1; // 1 or 2
    const difficulty = 1; // Try easy for more translations
    const url = `${RANDOM_WORD_API}?number=${WORDS_TO_FETCH}&diff=${difficulty}`;
    
    const req = new Request(url);
    const response = await req.loadJSON();
    
    console.log(`Random words response (diff=${difficulty}): ${JSON.stringify(response)}`);
    
    if (!response || !Array.isArray(response) || response.length === 0) {
      throw new Error("Invalid random word response");
    }
    
    return { words: response, difficulty };
  } catch (error) {
    console.error("Error fetching random words:", error);
    throw new Error("Failed to fetch random words from API");
  }
}

// Fetch translations for a word from API
async function fetchTranslations(word) {
  try {
    const url = `${TRANSLATION_API_BASE}${encodeURIComponent(word)}?translations=true`;
    console.log(`Fetching translations from: ${url}`);
    
    const req = new Request(url);
    const response = await req.loadJSON();
    
    console.log(`Response type: ${typeof response}, has word: ${!!response.word}`);
    
    // The API returns an object with { word, entries, source }, not an array
    if (!response || !response.word || !response.entries) {
      throw new Error(`No dictionary entry found for word: ${word}`);
    }
    
    return response;
  } catch (error) {
    console.error(`Error fetching translations for "${word}":`, error);
    throw new Error(`Could not find dictionary entry for: ${word}`);
  }
}

// Extract structured data from API response
function extractData(apiResponse, word, difficulty) {
  const difficultyLabels = { 1: "easy", 2: "medium-easy", 3: "medium" };
  const diffLabel = difficultyLabels[difficulty] || "";
  
  const data = {
    word: word,
    concept: "No definition available",
    difficulty: diffLabel,
    translations: {}
  };
  
  // Initialize all languages as not found
  for (const lang of LANGS) {
    data.translations[lang.code] = null;
  }
  
  // Set English word
  data.translations.en = word;
  
  try {
    // Extract definition and translations from the SAME sense for semantic consistency
    if (apiResponse.entries && apiResponse.entries.length > 0) {
      const firstEntry = apiResponse.entries[0];
      
      if (firstEntry.senses && firstEntry.senses.length > 0) {
        // Find the best sense: prioritize sense with most translations in our target languages
        let selectedSense = null;
        let bestScore = -1;
        
        for (const sense of firstEntry.senses) {
          if (sense.definition && sense.translations && sense.translations.length > 0) {
            // Count how many of our target languages this sense has
            const targetLangCodes = LANGS.map(l => l.code).filter(c => c !== 'en');
            const targetLangCount = sense.translations.filter(t => 
              targetLangCodes.includes(t.language?.code)
            ).length;
            
            // Score: prioritize target language count, then total translation count
            const score = (targetLangCount * 100) + sense.translations.length;
            
            if (score > bestScore) {
              bestScore = score;
              selectedSense = sense;
            }
          }
        }
        
        // Fallback: if no sense has translations, just use first sense for definition
        if (!selectedSense) {
          selectedSense = firstEntry.senses[0];
        }
        
        // Extract definition
        if (selectedSense.definition) {
          data.concept = `${selectedSense.definition} [${data.difficulty}]`;
        }
        
        // Extract translations from the SAME sense only
        if (selectedSense.translations && Array.isArray(selectedSense.translations)) {
          for (const translation of selectedSense.translations) {
            const langCode = translation.language?.code;
            const translatedWord = translation.word;
            
            if (langCode && translatedWord) {
              // Only store if we care about this language and don't have it yet
              if (data.translations.hasOwnProperty(langCode) && data.translations[langCode] === null) {
                data.translations[langCode] = translatedWord;
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error extracting data:", error);
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
    // Fetch multiple words at once (more efficient than retrying)
    debugInfo = `Fetching ${WORDS_TO_FETCH} random words...`;
    const { words, difficulty } = await fetchRandomWords();
    console.log(`Fetched ${words.length} words with difficulty ${difficulty}`);
    
    let data = null;
    let successfulWord = null;
    
    // Try each word until we find one with translations
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      try {
        debugInfo = `Trying word: ${word}`;
        console.log(`Trying word ${i + 1}/${words.length}: "${word}"`);
        
        // Fetch translations for this word
        const apiResponse = await fetchTranslations(word);
        
        // Extract structured data
        data = extractData(apiResponse, word, difficulty);
        
        // Check if we have at least one translation in target languages
        const targetLangCodes = LANGS.map(l => l.code).filter(c => c !== 'en');
        const hasTranslations = targetLangCodes.some(code => 
          data.translations[code] !== null
        );
        
        if (hasTranslations) {
          console.log(`Success! Word "${word}" has translations`);
          successfulWord = word;
          break; // Found a good word
        } else {
          console.log(`Word "${word}" has no translations in target languages, trying next...`);
        }
      } catch (error) {
        console.log(`Word "${word}" failed: ${error.message}, trying next...`);
        // Continue to next word
      }
    }
    
    // If no word worked, show error or use the last attempted word data
    if (!successfulWord && !data) {
      throw new Error("None of the fetched words have dictionary entries");
    } else if (!successfulWord) {
      console.log(`No words have translations, showing last word without translations`);
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
