import 'dotenv/config'
import { defineConfig, type Plugin } from 'vite'
import { existsSync, readFileSync } from 'fs'
import { glob, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const mockLogs = existsSync('./.dev.logs') ? readFileSync('./.dev.logs', 'utf-8') : null

const buildTime = Date.now() - new Date(2020, 0, 1).getTime()
export default defineConfig(({ mode }) => ({
  base: '',
  define: {
    'process.env.build': `'${pkg.version}-${Math.floor(buildTime / 1000 / 60 / 60)}'`,
    'process.env.MOCK_LOGS': JSON.stringify(mockLogs)
  },
  plugins: [
    tailwindcss(),
    ...(mode === 'mojito' ? [{
      name: 'mojito-assets',
      async writeBundle({ dir }) {
        if (!dir) return
        for await (const file of glob('icon/materia/slot_*.png', { cwd: dir })) {
          await unlink(join(dir, file))
        }
      },
      transformIndexHtml(html: string) {
        return html.replace(/<script[^>]*src="https:\/\/www.googletagmanager.com[^>]*><\/script>/g, '').replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/g, '')
      },
    } satisfies Plugin] : []),
  ],
  build: {
    assetsInlineLimit: mode === 'mojito' ? 0 : 4096,
    rolldownOptions: {
      checks: {
        moduleLevelDirective: false,
      },
      input: {
        main: 'index.html',
      },
    },
  },
}))
