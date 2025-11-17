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

### Nov 17, 2025
- **Fixed citation superscript rendering**: Changed citation links to use raw HTML `<a>` tags instead of hProperties to preserve `citation-link` class through remark-stringify
- **Fixed page numbering**: Corrected scope/indentation issues to ensure page numbers start at 1 on first content page (after title and TOC)
- Both fixes architect-reviewed and confirmed working

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
