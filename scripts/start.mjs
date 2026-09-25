/**
 * Entrypoint de producción (corrige el defecto D2 del plan).
 * El build de TanStack Start genera dist/server/server.js con un handler
 * `fetch` estilo WinterCG; este wrapper lo expone vía HTTP en Node y sirve
 * los assets estáticos de dist/client (JS/CSS/imágenes).
 *
 * Carga `.env` del raíz del proyecto ANTES de importar el servidor: el módulo
 * de entorno (`server/runtime/env.ts`) valida `process.env` al importarse, así
 * que las variables deben existir antes de ese import. Las variables ya
 * presentes en el proceso mandan (no se sobreescriben), igual que
 * `node --env-file`.
 */
import { createServer } from 'node:http'
import { stat, readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverPath = resolve(__dirname, '../dist/server/server.js')
const clientDir = resolve(__dirname, '../dist/client')

// ─── Carga de .env (antes de cualquier import del servidor) ──────────────────────────
const envPath = resolve(__dirname, '../.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // Comillas envolventes: se retiran (convención común de .env).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Lo ya presente en el proceso manda: permite `DATABASE_URL=... pnpm start`.
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.map': 'application/json',
}

const serverModule = await import(pathToFileURL(serverPath).href)
const handler = serverModule.default

const server = createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host ?? `${HOST}:${PORT}`}`
    const url = new URL(origin + req.url)
    const pathname = decodeURIComponent(url.pathname)

    // 1) Assets estáticos bajo /assets/ (emitidos por vite a dist/client)
    if (pathname.startsWith('/assets/')) {
      const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '')
      const filePath = join(clientDir, safe)
      if (filePath.startsWith(clientDir + sep) || filePath === join(clientDir, safe.replace(/^[/\\]+/, ''))) {
        try {
          const st = await stat(filePath)
          if (st.isFile()) {
            const body = await readFile(filePath)
            const etag = `"${st.size}-${st.mtimeMs | 0}"`
            res.statusCode = 200
            res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream')
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            res.setHeader('ETag', etag)
            res.end(req.method === 'HEAD' ? undefined : body)
            return
          }
        } catch {
          // cae al handler SSR → 404 correcto
        }
      }
    }

    // 2) El resto: SSR
    const request = new Request(origin + req.url, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      // @ts-expect-error duplex es necesario para streaming de body en Node
      duplex: 'half',
    })
    const response = await handler.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') res.setHeader(key, value)
    })
    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } else {
      res.end()
    }
  } catch (err) {
    console.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Maison Lumière → http://${HOST}:${PORT}`)
})
