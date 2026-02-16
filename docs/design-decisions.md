# Design Decisions - API-Powered Language Widget

## Overview
This document captures key design and implementation decisions made for the API-based version of the multilingual vocabulary widget.

---

## API Selection

### Random Word API
- **Chosen**: `https://random-word-api.herokuapp.com/word`
- **Returns**: Single random English word
- **Rationale**: Simple, straightforward API for getting random vocabulary words

### Translation API
- **Chosen**: `https://freedictionaryapi.com/api/v1/entries/en/{word}?translations=true`
- **Returns**: Dictionary entry with definitions and translations in 100+ languages
- **Response Structure**: `response.entries[0].senses[0]` contains definition and translations array
- **Rationale**: Comprehensive translation coverage with definitions included

---

## Language Support

### Supported Languages
- **English (EN)** - Base language, always present
- **German (DE)**
- **Indonesian (ID)**
- **Vietnamese (VI)**

### Dropped Language: Khmer
- **Decision**: Remove Khmer (KM) from API version
- **Rationale**: 
  - Khmer script is NOT phonetically straightforward
  - Cannot reliably derive pronunciation from native script without specialized libraries
  - API returns native Khmer script (ជម្រាបសួរ) not pronunciation (som-ROP-kloon)
  - Static version uses custom phonetic transcriptions unavailable in API
  - Adds complexity without clear solution
- **Alternative**: Keep static version for Khmer support, use API version for other 4 languages

---

## Data Handling

### Definition/Concept Field
- **Decision**: Use API definition as-is
- **Source**: `entries[0].senses[0].definition`
- **Rationale**: 
  - Keeps implementation simple
  - Avoids need for manual concept creation
  - API definitions are clear and descriptive
- **Trade-off**: API definitions are formal dictionary style vs. custom beginner-friendly concepts in static version

### Multiple Translation Variants
- **Decision**: Use first translation when API returns multiple variants
- **Example**: API returns ["hallo", "guten Tag", "servus"] for German - use "hallo"
- **Rationale**: 
  - Simplest implementation
  - First variant is typically most common/formal
  - Avoids decision logic for "best" translation
- **Future**: Could implement shortest/most common selection if needed

### Missing Translations
- **Decision**: Display "not found" or similar message when language missing from API response
- **Rationale**:
  - Provides clear feedback to user
  - Better than hiding the row entirely
  - Maintains consistent widget layout
- **Implementation**: Check if language exists in translations array, show placeholder if not

---

## Error Handling

### Retry Strategy
- **Decision**: NO retry logic initially
- **Rationale**:
  - Keep first implementation simple
  - Unclear if retry would improve results (random word might also lack translations)
  - Can add later if incomplete translations are common problem
- **Fallback**: Show partial results with "not found" for missing languages

### Network Failures
- **Decision**: Show error message in widget
- **Coverage**:
  - Random word API failure
  - Translation API failure
  - Network timeout
  - Invalid JSON responses
- **Future**: Could add fallback to static data if needed

---

## Caching Strategy

### Cache Decision
- **Decision**: NO caching - fetch fresh word on every widget refresh
- **Rationale**:
  - Maximizes vocabulary exposure
  - Learning benefit from seeing new words frequently
  - API calls appear fast enough
  - Simplifies implementation
- **Trade-off**: More API calls, but better learning experience
- **Future**: Could add optional 1-2 hour cache if API rate limiting becomes issue

---

## Implementation Priorities

### Phase 1 (Current)
- ✅ Basic API integration (random word + translations)
- ✅ 4 language support (EN, DE, ID, VI)
- ✅ Show definition from API
- ✅ Handle missing translations with "not found"
- ✅ Basic error handling for network failures

### Phase 2 (Future Enhancements)
- ⏸️ Retry logic for incomplete translations (if needed)
- ⏸️ Caching layer (if API rate limiting occurs)
- ⏸️ Smart translation selection (shortest/most common)
- ⏸️ Fallback to static data on repeated failures
- ⏸️ Loading state indicator

---

## Technical Constraints

### Scriptable Environment
- Must use async/await for API calls
- FileManager available for caching (not used initially)
- Widget refresh timing managed by iOS
- No control over refresh frequency

### API Limitations
- No guarantee all words have all language translations
- Large response payloads (9000+ lines for "hello")
- No pronunciation data
- Multiple variants without quality indicators

---

## Success Criteria

### Minimum Viable Product
- Widget displays random English word with definition
- Shows translations for EN, DE, ID, VI (or "not found")
- Handles API failures gracefully
- Maintains visual consistency with static version
- Works in both lock screen and home screen layouts

---

*Last Updated: 2026-02-13*
