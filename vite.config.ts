import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function copy404Plugin(): Plugin {
  return {
    name: 'copy-404',
    closeBundle() {
      const outDir = path.join(__dirname, 'docs')
      const indexHtml = path.join(outDir, 'index.html')
      const notFoundHtml = path.join(outDir, '404.html')
      try {
        fs.copyFileSync(indexHtml, notFoundHtml)
      } catch {
        // ignore: build may not have produced index.html yet
      }
    },
  }
}

export default defineConfig({
  plugins: [copy404Plugin()],
  // 让打包后的资源使用相对路径，直接适配 GitHub Pages 子路径（/repo/）
  base: './',
  build: {
    // GitHub Pages 可以直接选 docs/ 作为发布目录
    outDir: 'docs',
  },
  server: { port: 5173, open: true },
  preview: { port: 4173, open: true },
})
