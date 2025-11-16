# Project Structure

## Directory Organization

```
workspace/
├── frontend/              # Main React application
│   ├── src/
│   │   ├── pdf/          # PDF generation logic
│   │   ├── doc/          # DOCX generation logic
│   │   └── utils/        # Markdown processing utilities
│   ├── vite.config.ts    # Vite configuration (handles file saving)
│   └── package.json      # Frontend dependencies
├── output/               # Generated PDFs, DOCX, and processed markdown files
├── tests/                # Automated test scripts
│   ├── test-pdf-citations.js  # Main test script
│   ├── README.md              # Test documentation
│   ├── TEST_INSTRUCTIONS.md   # Detailed test guide
│   └── README_TEST.md         # Quick reference
└── package.json          # Root package.json with test commands
```

## Output Directory

The `output/` directory is where all generated files are automatically saved when you use the app in development mode:

- **PDFs** - Generated when you click "Download PDF"
- **DOCX files** - Generated when you click "Download DOCX"
- **Processed Markdown** - Generated when you click "Download Processed Markdown"

### Configuration

The output directory is configured in `frontend/vite.config.ts` at the `/api/save-file` endpoint:

```typescript
const outputDir = path.join(process.cwd(), '..', 'output')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}
const filePath = path.join(outputDir, filename)
fs.writeFileSync(filePath, content, 'binary')
console.log(`✓ Saved ${filename} to output/`)
```

## Tests Directory

The `tests/` directory contains automated validation scripts for ensuring PDF quality:

### Running Tests

```bash
npm test
```

This will:
1. Find the latest PDF in `output/`
2. Extract bibliography entries and citation references
3. Validate that no citations exceed the bibliography count
4. Report any broken references

### Test Files

- **test-pdf-citations.js** - Main validation script
- **README.md** - Test documentation and usage guide
- **TEST_INSTRUCTIONS.md** - Detailed technical documentation
- **README_TEST.md** - Quick reference with example outputs

## How Files Flow

1. **User uploads markdown** → App processes it
2. **User clicks "Download PDF/DOCX/Markdown"** → File is generated
3. **In dev mode** → File is automatically saved to `output/`
4. **User runs `npm test`** → Test validates the latest PDF in `output/`

## Development Workflow

1. Process your markdown file in the application
2. Generate PDF/DOCX/processed markdown
3. Files are automatically saved to `output/` (in dev mode)
4. Run `npm test` to validate the PDF output
5. Review test results for any citation mismatches

## Production vs Development

- **Development mode**: Files are saved to `output/` directory automatically
- **Production mode**: Files are only downloaded to user's browser (not saved to server)

The `/api/save-file` endpoint only runs in development mode (`import.meta.env.DEV`).
