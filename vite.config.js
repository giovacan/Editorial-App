import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const LOG_PATH = path.resolve('./pagination-log.json')
const TOC_LOG_PATH = path.resolve('./toc-log.json')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pagination-log',
      configureServer(server) {
        server.middlewares.use('/api/pagination-log', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (req.method !== 'POST') { res.end('{}'); return }
          let body = ''
          req.on('data', d => body += d)
          req.on('end', () => {
            try { fs.writeFileSync(LOG_PATH, body) } catch {}
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          })
        })
        server.middlewares.use('/api/toc-log', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (req.method !== 'POST') { res.end('{}'); return }
          let body = ''
          req.on('data', d => body += d)
          req.on('end', () => {
            try { fs.writeFileSync(TOC_LOG_PATH, body) } catch {}
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          })
        })
      }
    }
  ],
  server: {
    fs: {
      deny: ['docs/**'],
    },
  },
})
