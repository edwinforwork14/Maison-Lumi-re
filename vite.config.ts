import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nitro } from 'nitro/vite'

export default defineConfig(({ mode }) => {
  // Carga .env y expone TODAS las variables a process.env (no solo VITE_)
  const env = loadEnv(mode, process.cwd(), '')
  for (const key in env) {
    if (process.env[key] === undefined) {
      process.env[key] = env[key]
    }
  }

  return {
    server: { port: 3000 },
    plugins: [tsconfigPaths(), tanstackStart(), nitro(), tailwindcss(), viteReact()],
  }
})
