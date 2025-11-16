# PDF Citation Test Script

## Overview
This test script validates that all citation references in a generated PDF match the bibliography entries. It ensures there are no broken references where citations exceed the bibliography count.

## How It Works

1. **Finds Latest PDF**: Automatically locates the most recently generated PDF in the `output/` directory
2. **Extracts Bibliography**: Scans for the "Bibliography" section and identifies all numbered entries
3. **Extracts Citations**: Finds all citation references in the format `[1]`, `[2]`, etc.
4. **Validates**: Checks that no citation number exceeds the highest bibliography entry number

## Usage

### Run the test:
```bash
npm test
```

Or directly:
```bash
node test-pdf-citations.js
```

## Test Output

The script provides detailed output:

### Successful Test Example:
```
🧪 PDF Citation Validator

============================================================

📄 Testing PDF: output.pdf

📚 Bibliography Analysis:
   - Total entries found: 157
   - Number range: 1 to 157

🔗 Citation Analysis:
   - Unique citations found: 145
   - Citation range: 1 to 157

📊 Validation Results:
   ✅ PASSED: All citations are within valid range [1-157]
   - Maximum citation found: [157]
   - Maximum bibliography entry: [157]

============================================================

✅ TEST PASSED
```

### Failed Test Example:
```
🧪 PDF Citation Validator

============================================================

📄 Testing PDF: output.pdf

📚 Bibliography Analysis:
   - Total entries found: 157
   - Number range: 1 to 157

🔗 Citation Analysis:
   - Unique citations found: 178
   - Citation range: 1 to 357

📊 Validation Results:
   ❌ FAILED: Found 23 citation(s) exceeding bibliography count
   - Bibliography max: [157]
   - Invalid citations: [158], [159], [160], [357], ...

   🔍 Sample invalid citation context(s):
   - [357]: "...some text with broken citation [357] in the middle..."

============================================================

❌ TEST FAILED
```

## Integration into Workflow

You can run this test after generating any PDF to validate:
1. Generate PDF from your markdown file
2. Run `npm test` to validate citations
3. Fix any issues reported
4. Re-generate and re-test until passing

## Exit Codes

- `0`: Test passed - all citations are valid
- `1`: Test failed - found invalid citations or errors

## Requirements

- Node.js with ES modules support
- `pdf-parse` package (automatically installed)
- At least one PDF file in the `output/` directory
