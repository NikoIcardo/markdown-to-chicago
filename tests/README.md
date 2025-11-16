# PDF Citation Validation Tests

This directory contains automated tests for validating the markdown-to-PDF conversion application.

## Quick Start

After generating a PDF from your markdown file, run:

```bash
npm test
```

This will automatically:
- Find the latest PDF in the `../output/` directory
- Scan the bibliography to find the highest entry number
- Check all citation references `[1]`, `[2]`, etc.
- **FAIL** if any citation exceeds the bibliography count
- **PASS** if all citations are valid

## Files

- **test-pdf-citations.js** - The main test script that validates PDFs
- **TEST_INSTRUCTIONS.md** - Detailed documentation on how the test works
- **README_TEST.md** - Quick reference guide with example output

## Example Output

### ✅ Passing Test
```
🧪 PDF Citation Validator
============================================================
📄 Testing PDF: my-document.pdf

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

### ❌ Failing Test
```
🧪 PDF Citation Validator
============================================================
📄 Testing PDF: my-document.pdf

📚 Bibliography Analysis:
   - Total entries found: 157
   - Number range: 1 to 157

🔗 Citation Analysis:
   - Unique citations found: 200
   - Citation range: 1 to 357

📊 Validation Results:
   ❌ FAILED: Found 43 citation(s) exceeding bibliography count
   - Bibliography max: [157]
   - Invalid citations: [158], [159], [200], [357], ...

   🔍 Sample invalid citation context(s):
   - [357]: "...example text with broken reference [357]..."

============================================================
❌ TEST FAILED
```

## Integration

The test automatically finds the most recently generated PDF in the `../output/` directory, so you can:

1. Process your markdown file in the app
2. Click "Download PDF" (saves to `output/` in dev mode)
3. Run `npm test` from the project root
4. Review the validation results

## Requirements

- Node.js with ES modules support
- `pdf-parse` package (automatically installed)
- At least one PDF file in the `output/` directory
