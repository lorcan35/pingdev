import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 8080

// API endpoints
app.get('/api/status', (_req, res) => {
  res.json({
    device: 'TinkerTab',
    platform: 'Dragon Q6A',
    display: '720x1280',
    uptime: process.uptime(),
    aiTier: 'local',
    version: '0.1.0',
  })
})

// Serve static build
app.use(express.static(join(__dirname, 'dist')))

// SPA fallback — serve index.html for all non-API routes
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TinkerTab OS running on http://0.0.0.0:${PORT}`)
})
