# Multilingual Lock Screen Vocab Widget (Scriptable)

This project is a **personalizable vocabulary widget** for iOS built with the [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) app. It shows one random concept in **multiple languages** directly on your **lock screen**.

The focus is on **daily passive exposure** to vocabulary across several languages at once.

---

## Available Versions

This project includes three different script versions to suit different needs:

### 1. **script_static.js** - Static Vocabulary List
- Self-contained vocabulary entries defined in the script
- No internet connection required
- Perfect for curated word lists
- Easy to customize and add your own words
- Supports any languages you define

### 2. **script_api.js** - Dynamic with Public APIs
- Fetches random words from a public random word API
- Translates words using LibreTranslate API
- Gets fresh vocabulary automatically
- Requires internet connection
- Configure difficulty level and number of words

### 3. **script_elastic.js** - Elastic Agent Builder Integration
- Uses Elastic Agent Builder tool for word generation and translations
- Single API call replaces both word fetching and translation
- Centralized configuration in your Elastic agent
- Requires Elastic Cloud setup with Agent Builder
- Supports any languages configured in your Elastic tool

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

---

## Quick Start

### Using Static Version (script_static.js)

1. Open Scriptable app on iOS
2. Create a new script and paste the contents of `script_static.js`
3. Customize the `entries` array with your vocabulary
4. Configure `USER_LANGUAGE_CODES` with desired languages
5. Add widget to your lock screen or home screen

### Using API Version (script_api.js)

1. Copy `script_api.js` to Scriptable
2. Configure at the top:
   - `USER_LANGUAGE_CODES`: languages you want to learn
   - `WORDS_TO_FETCH`: how many words to fetch
   - Optionally adjust difficulty level
3. Add widget (requires internet connection)

### Using Elastic Version (script_elastic.js)

1. Set up Elastic Agent Builder tool with your word generation workflow
2. Copy `script_elastic.js` to Scriptable
3. Configure at the top:
   - `ELASTIC_API_URL`: your Elastic instance URL
   - `ELASTIC_API_KEY`: your API key
   - `ELASTIC_TOOL_ID`: your tool ID
   - `USER_LANGUAGE_CODES`: languages to display (must match what your Elastic agent provides)
4. Add widget

**Common language codes:**
- `"ar"` - Arabic, `"de"` - German, `"es"` - Spanish
- `"fr"` - French, `"hi"` - Hindi, `"id"` - Indonesian
- `"it"` - Italian, `"ja"` - Japanese, `"ko"` - Korean
- `"nl"` - Dutch, `"pl"` - Polish, `"pt"` - Portuguese
- `"ru"` - Russian, `"th"` - Thai, `"tr"` - Turkish
- `"vi"` - Vietnamese, `"zh"` - Chinese (Simplified)

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
