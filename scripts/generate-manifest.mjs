import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.join(__dirname, '..', 'public', 'manifest.json')

if (!fs.existsSync(outFile)) {
  console.error('未找到 manifest.json，请确保 public/manifest.json 已提交到仓库：', outFile)
  process.exit(1)
}

const raw = fs.readFileSync(outFile, 'utf8')
const data = JSON.parse(raw)
const count = typeof data?.count === 'number' ? data.count : 'unknown'
console.log('manifest exists:', outFile, 'books:', count)
