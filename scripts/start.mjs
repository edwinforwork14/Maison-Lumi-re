/**
 * Entrypoint de producción (corrige el defecto D2 del plan).
 * El build de TanStack Start genera dist/server/server.js con un handler
 * `fetch` estilo WinterCG; este wrapper lo expone vía HTTP en Node.
 */
import { createServer } from 'node:http'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverPath = resolve(__dirname, '../dist/server/server.js')

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

const serverModule = await import(pathToFileURL(serverPath).href)
const handler = serverModule.default

const server = createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host ?? `${HOST}:${PORT}`}`
    const request = new Request(origin + req.url, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      // @ts-expect-error duplex es necesario para streaming de body en Node
      duplex: 'half',
    })
    const response = await handler.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    if (response.body) {
      const reader = response.body.getReader()
      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      }
      await pump()
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
