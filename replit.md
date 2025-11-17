# Markdown to PDF Converter

## Project Overview
A React + TypeScript + Vite frontend application that processes markdown files, automatically generates bibliographies with proper citations, and exports formatted PDFs with title pages, table of contents, and page numbers.

## Key Features
- Upload markdown files for processing
- Automatic bibliography generation with web source metadata fetching
- Citation linking with superscript references
- PDF generation with Puppeteer including:
  - Title page
  - Table of contents
  - Numbered pages (excluding title & TOC)
  - Customizable fonts and sizes
- DOCX export option
- Preview of original and processed markdown
- **Session persistence**: Work is automatically saved to localStorage and restored on page refresh
  - Uploaded file and content preserved
  - Manual citation entries saved (no data loss during long citation sessions)
  - User preferences maintained

## Architecture
- **Frontend**: React 19 + TypeScript + Vite
- **PDF Generation**: Puppeteer with Chromium for server-side rendering
- **Markdown Processing**: unified, remark plugins (GFM, frontmatter, etc.)
- **Metadata Fetching**: Automatic extraction from web pages and PDFs using pdfjs-dist
- **Backend Middleware**: Custom Vite plugin provides `/api/generate-pdf` and `/api/save-file` endpoints

## Project Structure
```
frontend/
├── src/
│   ├── App.tsx              # Main application component
│   ├── utils/
│   │   ├── markdownProcessor.ts    # Core markdown processing logic
│   │   ├── metadataFetcher.ts      # Web source metadata extraction
│   │   ├── sessionStorage.ts       # localStorage persistence helpers
│   │   └── types.ts                # TypeScript type definitions
│   ├── pdf/
│   │   ├── generatePdf.ts          # Client-side PDF generation
│   │   └── generatePdfPuppeteer.ts # Server-side Puppeteer PDF generation
│   └── doc/
│       └── generateDocx.ts         # DOCX generation
├── vite.config.ts          # Vite config with custom middleware
└── package.json
```

## Recent Changes

### Nov 17, 2025 (Latest)
- **Smart Citation Parsing with HTML Stripping**: Enhanced metadata extraction from existing bibliography entries
  - Strips HTML anchor tags (`<a id="bib-X"></a>`) before parsing to support re-uploading processed markdown
  - Parses titles (quoted, italicized, or plain text), authors, dates, and publisher/site names
  - Extracts titles BEFORE stripping access markers to preserve titles containing "Accessed/Retrieved/Viewed"
  - Removes trailing punctuation from extracted titles (prevents double periods in citations)
  - Strips standalone "Accessed/Retrieved/Viewed" markers only at end of text (preserves site names starting with these words)
  - Pre-fills metadata form with any existing information found
  - Supports various date formats (full dates, month-year, year only)
  - **Download → Re-upload flow**: Processed markdown files can be re-uploaded without data corruption
- **Automatic File Backup**: Uploaded markdown files now automatically saved to `output/` folder
  - Original markdown preserved for reference alongside generated PDFs
  - Uses existing `/api/save-file` endpoint

### Nov 17, 2025 (Earlier)
- **Session Persistence**: Added localStorage integration to preserve work across page refreshes
  - Uploaded files, processed markdown, and manual citations are now automatically saved
  - Session clears only when uploading a new file
  - Created `sessionStorage.ts` utility with safe serialization and error handling
- **Improved UX**: Updated metadata modal messaging and placeholder text
  - Changed "We couldn't retrieve metadata" to "Please enter citation details"
  - Added flexible date format examples (e.g., "October, 2025" or "March 15, 2025")
- **Automatic Page Numbering**: Implemented TOC-based heuristic detection
  - Estimates ~30 entries per TOC page
  - Calculates first content page automatically
  - No more hardcoded values
- **Fixed citation superscript rendering**: Changed citation links to use raw HTML `<a>` tags instead of hProperties to preserve `citation-link` class through remark-stringify
- **Fixed page numbering**: Corrected scope/indentation issues to ensure page numbers start at 1 on first content page (after title and TOC)
- **Incomplete Citation Detection**: System checks existing bibliography entries and prompts for missing metadata

### Nov 16, 2025
- Configured Vite to work with Replit environment
  - Server bound to 0.0.0.0:5000
  - Allowed all hosts for proxy support
  - HMR configured for WSS on port 443
- Installed Chromium and required system dependencies
- Configured Puppeteer to use system Chromium executable
- Set up development workflow

## Development
- Run: `npm run dev` in the frontend directory
- Port: 5000 (webview)
- The app uses Vite's dev server with custom middleware for PDF generation

## Dependencies
- Chromium and X11 libraries for Puppeteer
- Node.js 20
- npm packages listed in frontend/package.json

## Environment Notes
- Running on Replit with NixOS
- Chromium path: `/nix/store/.../chromium-browser`
- Dev server allows all hosts due to Replit's proxy architecture
