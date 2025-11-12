import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as fs from 'fs'
import * as path from 'path'

// Plugin to save downloaded files to repo root in dev mode
function saveFilesToRoot() {
  return {
    name: 'save-files-to-root',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/api/save-file' && req.method === 'POST') {
          let body = Buffer.alloc(0)
          
          req.on('data', (chunk: Buffer) => {
            body = Buffer.concat([body, chunk])
          })
          
          req.on('end', () => {
            try {
              // Parse multipart form data manually (simple approach)
              const boundary = req.headers['content-type']?.split('boundary=')[1]
              if (!boundary) {
                res.statusCode = 400
                res.end('No boundary found')
                return
              }
              
              const parts = body.toString('binary').split(`--${boundary}`)
              for (const part of parts) {
                if (part.includes('filename=')) {
                  const filenameMatch = part.match(/filename="([^"]+)"/)
                  if (filenameMatch) {
                    const filename = filenameMatch[1]
                    // Find the actual file content (after double newline)
                    const contentStart = part.indexOf('\r\n\r\n') + 4
                    const contentEnd = part.lastIndexOf('\r\n')
                    if (contentStart > 3 && contentEnd > contentStart) {
                      const content = part.substring(contentStart, contentEnd)
                      const filePath = path.join(process.cwd(), '..', filename)
                      fs.writeFileSync(filePath, content, 'binary')
                      console.log(`✓ Saved ${filename} to repo root`)
                    }
                  }
                }
              }
              
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (error) {
              console.error('Error saving file:', error)
              res.statusCode = 500
              res.end('Error saving file')
            }
          })
        } else {
          next()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveFilesToRoot()],
})
