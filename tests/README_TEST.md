# PDF Citation Validation Test

## Quick Start

After generating a PDF from your markdown file, run:

```bash
npm test
```

This will automatically:
- Find the latest PDF in the `output/` directory
- Scan the bibliography to find the highest entry number
- Check all citation references `[1]`, `[2]`, etc.
- **FAIL** if any citation exceeds the bibliography count
- **PASS** if all citations are valid

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

## What It Checks

1. **Bibliography Count**: Finds the highest numbered entry in the bibliography
2. **Citation Range**: Scans entire PDF for all citation references
3. **Validation**: Ensures no citation number exceeds the bibliography maximum
4. **Reports**: Shows exactly which citations are broken and where they appear

## Files

- `test-pdf-citations.js` - The test script
- `package.json` - Configured with `npm test` command
- `output/` - Directory where PDFs are saved (auto-created)

## Technical Details

The script uses `pdf-parse` to extract text from PDFs, then:
- Regex to find bibliography entries: `/^\s*(\d+)\.\s+/gm`
- Regex to find citations: `/\[(\d+)\]/g`
- Compares maximum citation against maximum bibliography number

See `TEST_INSTRUCTIONS.md` for detailed documentation.
