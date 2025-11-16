# Pull Request: Organize Tests and Fix PDF Output Directory

## Summary
This PR organizes the test infrastructure into a dedicated directory and ensures generated PDFs are properly saved to the `output/` folder for automated testing and validation.

## Changes Made

### 1. Test Organization
- **Created `tests/` directory** for better project structure
- **Moved test files**:
  - `test-pdf-citations.js` → `tests/test-pdf-citations.js`
  - `TEST_INSTRUCTIONS.md` → `tests/TEST_INSTRUCTIONS.md`
  - `README_TEST.md` → `tests/README_TEST.md`
- **Added `tests/README.md`** - Comprehensive test documentation
- **Updated `package.json`** to reference new test location

### 2. PDF Output Directory Fix
- **Modified `frontend/vite.config.ts`**:
  - Changed file save location from repo root to `output/` directory
  - Added automatic directory creation if it doesn't exist
  - Updated console messages to reflect new location
- **Files now save to `output/`** when using:
  - Download PDF button
  - Download DOCX button
  - Download Processed Markdown button

### 3. Enhanced Debugging
- **Updated `frontend/src/App.tsx`**:
  - Added detailed console logging for save operations
  - Shows environment mode and DEV status
  - Displays save request status and errors
  - Better error handling and reporting

### 4. Fixed Test Script
- **Updated `tests/test-pdf-citations.js`**:
  - Fixed path to look for PDFs in `output/` directory at project root
  - Updated to use pdf-parse v2 API (PDFParse class)
  - Proper ESM module imports
  - Better error handling

### 5. Documentation
- **Created `PROJECT_STRUCTURE.md`** - Documents directory organization and file flow

## Testing
✅ PDFs now save to `output/` directory in dev mode
✅ Test script successfully finds and validates PDFs
✅ Both user download AND server copy work correctly

## How to Test
1. Process a markdown file with citations
2. Click "Download PDF"
3. PDF downloads to user's browser AND saves to `output/`
4. Run `npm test` to validate the PDF
5. Check `output/` directory for the generated file

## Files Changed
- `frontend/src/App.tsx` - Enhanced save logging
- `frontend/vite.config.ts` - Output directory configuration
- `package.json` - Updated test command paths
- `tests/test-pdf-citations.js` - Fixed imports and API usage
- `tests/README.md` - New comprehensive test documentation
- `PROJECT_STRUCTURE.md` - New project structure documentation

## Benefits
- 📁 Better project organization with dedicated test directory
- 🧪 Automated PDF validation through `npm test`
- 📝 Clear documentation for testing workflow
- 🔧 Easy debugging with detailed console logs
- ✅ Files properly saved for both user download and testing

## Breaking Changes
None - all changes are additive or improve existing functionality.
