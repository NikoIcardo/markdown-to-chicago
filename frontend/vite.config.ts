import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Compile TypeScript to JavaScript using esbuild and return the module
async function loadPdfModule() {
  const srcPath = path.resolve(__dirname, "src/pdf/generatePdfPuppeteer.ts");
  const outPath = path.resolve(__dirname, "node_modules/.cache/generatePdfPuppeteer.mjs");
  
  // Ensure cache directory exists
  const cacheDir = path.dirname(outPath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  // Always recompile to ensure we have the latest bundled version
  // This avoids issues with stale cache files from previous configurations
  console.log("Compiling PDF module with esbuild...");
  await build({
    entryPoints: [srcPath],
    outfile: outPath,
    // Bundle ALL dependencies so imports resolve correctly
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    sourcemap: false,
    // Only mark native/binary packages as external
    // Everything else (including remark-*) should be bundled
    external: [
      "puppeteer",
      "pdfjs-dist", 
      "canvas",
    ],
    // Resolve modules from the frontend directory
    absWorkingDir: __dirname,
    // Log external imports to debug
    logLevel: "info",
  });
  console.log("PDF module compiled successfully");
  
  // Use native import with file:// URL and cache buster to ensure fresh module
  return import(/* @vite-ignore */ `file://${outPath}?t=${Date.now()}`);
}

// Plugin to save downloaded files to repo root in dev mode
function saveFilesToRoot() {
  return {
    name: "save-files-to-root",
    configureServer(server: any) {
      // Cache the PDF module to avoid re-importing on every request
      // Use Promise to handle concurrent requests safely
      let pdfModulePromise: Promise<any> | null = null;

      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split("?")[0];

        if (url === "/api/save-file" && req.method === "POST") {
          let body = Buffer.alloc(0);

          req.on("data", (chunk: Buffer) => {
            body = Buffer.concat([body, chunk]);
          });

          req.on("end", () => {
            try {
              const boundary =
                req.headers["content-type"]?.split("boundary=")[1];
              if (!boundary) {
                res.statusCode = 400;
                res.end("No boundary found");
                return;
              }

              const parts = body.toString("binary").split(`--${boundary}`);
              for (const part of parts) {
                if (part.includes("filename=")) {
                  const filenameMatch = part.match(/filename="([^"]+)"/);
                  if (filenameMatch) {
                    const filename = filenameMatch[1];
                    const contentStart = part.indexOf("\r\n\r\n") + 4;
                    const contentEnd = part.lastIndexOf("\r\n");
                    if (contentStart > 3 && contentEnd > contentStart) {
                      const content = part.substring(contentStart, contentEnd);
                      const outputDir = path.join(
                        process.cwd(),
                        "..",
                        "output"
                      );
                      if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                      }
                      const filePath = path.join(outputDir, filename);
                      fs.writeFileSync(filePath, content, "binary");
                      console.log(`✓ Saved ${filename} to output/`);
                    }
                  }
                }
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              console.error("Error saving file:", error);
              res.statusCode = 500;
              res.end("Error saving file");
            }
          });
          return;
        }

        if (url === "/api/generate-pdf" && req.method === "POST") {
          let body = "";
          req.setEncoding("utf8");

          req.on("data", (chunk: string) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const processed = payload?.processed;
              const options = payload?.options ?? {};

              if (!processed || typeof processed.modified !== "string") {
                res.statusCode = 400;
                res.end("Invalid processed payload");
                return;
              }

              // Use esbuild to compile TypeScript and native import to load the module
              // This bypasses Vite's SSR transformation pipeline which has issues with certain packages
              // Cache module promise to avoid re-importing on every request and handle concurrent requests
              if (!pdfModulePromise) {
                pdfModulePromise = loadPdfModule();
              }
              const pdfModule = await pdfModulePromise;
              const { generatePdfWithPuppeteer } = pdfModule;
              const allowedFonts = new Set([
                "Times New Roman",
                "Helvetica",
                "Courier New",
              ] as const);
              const fontFamily =
                typeof options.fontFamily === "string" &&
                allowedFonts.has(options.fontFamily)
                  ? options.fontFamily
                  : undefined;
              const fontSize =
                typeof options.fontSize === "number" &&
                Number.isFinite(options.fontSize)
                  ? options.fontSize
                  : undefined;
              const pdfBuffer: Buffer = await generatePdfWithPuppeteer(
                processed,
                {
                  fontFamily,
                  fontSize,
                }
              );

              const downloadNameBase =
                typeof options.originalFileName === "string" &&
                options.originalFileName
                  ? options.originalFileName.replace(/\.md$/i, "")
                  : processed.title || "document";

              const downloadName = `${sanitizeFileName(
                downloadNameBase || "document"
              )}.pdf`;

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="${downloadName}"`
              );
              res.setHeader("Cache-Control", "no-store");
              res.end(pdfBuffer);
            } catch (error) {
              console.error("Error generating PDF:", error);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Error generating PDF" }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveFilesToRoot()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
  },
  ssr: {
    // Externalize these packages so they're loaded directly from node_modules
    // instead of being transformed by Vite's SSR pipeline
    external: [
      "puppeteer",
      "pdfjs-dist",
      "pdfjs-dist/legacy/build/pdf.mjs",
      "pdf-lib",
      "canvas",
    ],
    // Transform all other packages (required for ESM-only remark packages)
    noExternal: true,
  },
  optimizeDeps: {
    // Exclude these packages from pre-bundling
    exclude: ["puppeteer", "pdfjs-dist", "pdf-lib", "canvas"],
  },
});
