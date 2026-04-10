import './style.css'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

type Book = { url: string; title: string }
type Level = { id: string; label: string; books: Book[] }
type Manifest = { title: string; count: number; levels: Level[] }

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let currentPage = 1
let currentScale = 1.25
let currentUrl: string | null = null
let currentTitle = ''

const app = document.querySelector<HTMLDivElement>('#app')!

const DEFAULT_BOOKS_BASE_URL =
  'https://bookworm-1258286069.cos.ap-chengdu.myqcloud.com/%E6%96%87%E6%9C%ACPDF%E5%90%88%E9%9B%86%E3%80%90149%E5%86%8C%E5%85%A8%E3%80%91'
const BOOKS_BASE_URL =
  (import.meta.env.VITE_BOOKS_BASE_URL as string | undefined) ??
  DEFAULT_BOOKS_BASE_URL

function resolveBookUrlCandidates(input: string): string[] {
  const raw = input.trim()
  if (/^https?:\/\//i.test(raw)) return [raw]

  const base = BOOKS_BASE_URL.replace(/\/+$/, '')
  const rel = raw.replace(/^\/+/, '')
  const stripped = rel.replace(/^library\//, '')

  // COS 上实际不包含 library/ 这一层，因此这里直接使用去掉前缀后的路径，避免先请求一次必然 404 的 URL。
  return [`${base}/${stripped}`]
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (className) n.className = className
  if (text !== undefined) n.textContent = text
  return n
}

async function loadManifest(): Promise<Manifest> {
  const res = await fetch('manifest.json')
  if (!res.ok) throw new Error('无法加载书目 manifest.json，请先执行 npm run manifest')
  return res.json() as Promise<Manifest>
}

function renderSidebar(manifest: Manifest, filter: string): HTMLElement {
  const aside = el('aside', 'sidebar')
  const head = el('div', 'sidebar-header')
  head.appendChild(el('h1', '', '书虫 PDF 阅读器'))
  const meta = el('div', 'meta', `${manifest.title} · 共 ${manifest.count} 册`)
  head.appendChild(meta)

  const input = document.createElement('input')
  input.type = 'search'
  input.className = 'search'
  input.placeholder = '搜索书名…'
  input.value = filter
  head.appendChild(input)

  const listRoot = el('div', 'book-list')
  const q = filter.trim().toLowerCase()

  for (const level of manifest.levels) {
    const matching = q
      ? level.books.filter((b) => b.title.toLowerCase().includes(q))
      : level.books
    if (matching.length === 0) continue

    const details = el('details', 'level')
    details.open = true
    const sum = document.createElement('summary')
    sum.textContent = `${level.label}（${matching.length}）`
    details.appendChild(sum)

    const ul = el('ul')
    for (const book of matching) {
      const li = el('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = book.title
      if (book.url === currentUrl) btn.classList.add('active')
      btn.addEventListener('click', () => {
        void openPdf(book.url, book.title)
        document.querySelectorAll('.level li button.active').forEach((b) =>
          b.classList.remove('active'),
        )
        btn.classList.add('active')
      })
      li.appendChild(btn)
      ul.appendChild(li)
    }
    details.appendChild(ul)
    listRoot.appendChild(details)
  }

  if (!listRoot.childNodes.length) {
    listRoot.appendChild(el('div', 'placeholder', '没有匹配的书目'))
  }

  aside.appendChild(head)
  aside.appendChild(listRoot)

  return aside
}

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')!

async function renderPage() {
  if (!pdfDoc) return
  const page = await pdfDoc.getPage(currentPage)
  const vp = page.getViewport({ scale: currentScale })
  canvas.width = Math.floor(vp.width)
  canvas.height = Math.floor(vp.height)
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
}

function updateToolbar(
  titleEl: HTMLElement,
  pageLabel: HTMLElement,
  pageInput: HTMLInputElement,
  prevBtn: HTMLButtonElement,
  nextBtn: HTMLButtonElement,
) {
  titleEl.textContent = currentTitle || '请选择左侧书目'
  const num = pdfDoc?.numPages ?? 0
  pageLabel.textContent = `/ ${num}`
  pageInput.value = String(currentPage)
  pageInput.max = String(Math.max(1, num))
  prevBtn.disabled = currentPage <= 1
  nextBtn.disabled = !pdfDoc || currentPage >= num
}

async function openPdf(url: string, title: string) {
  currentUrl = url
  const titleEl = document.querySelector<HTMLElement>('.toolbar .title')!
  const pageLabel = document.querySelector<HTMLElement>('.page-total')!
  const pageInput = document.querySelector<HTMLInputElement>('.page-input')!
  const prevBtn = document.querySelector<HTMLButtonElement>('.btn-prev')!
  const nextBtn = document.querySelector<HTMLButtonElement>('.btn-next')!
  const viewer = document.querySelector<HTMLElement>('.viewer-wrap')!

  titleEl.textContent = '加载中…'
  try {
    if (pdfDoc) {
      await pdfDoc.destroy()
      pdfDoc = null
    }
    const candidates = resolveBookUrlCandidates(url)
    let lastErr: unknown = null
    for (const candidate of candidates) {
      try {
        const loading = pdfjsLib.getDocument({ url: candidate })
        pdfDoc = await loading.promise
        lastErr = null
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!pdfDoc) throw lastErr ?? new Error('无法打开 PDF')
    currentPage = 1
    currentTitle = title
    viewer.innerHTML = ''
    viewer.appendChild(canvas)
    await renderPage()
    updateToolbar(titleEl, pageLabel, pageInput, prevBtn, nextBtn)
  } catch (e) {
    console.error(e)
    pdfDoc = null
    currentTitle = title
    viewer.innerHTML = ''
    viewer.appendChild(
      el('div', 'error', `无法打开 PDF：${e instanceof Error ? e.message : String(e)}`),
    )
    updateToolbar(titleEl, pageLabel, pageInput, prevBtn, nextBtn)
  }
}

function buildMain(): HTMLElement {
  const main = el('main', 'main')
  const toolbar = el('div', 'toolbar')
  toolbar.appendChild(el('div', 'title', '请选择左侧书目'))

  const prevBtn = el('button', 'btn-prev', '上一页') as HTMLButtonElement
  prevBtn.disabled = true
  const nextBtn = el('button', 'btn-next', '下一页') as HTMLButtonElement
  nextBtn.disabled = true

  const pageBox = el('div', 'page-box')
  pageBox.appendChild(document.createTextNode('第 '))
  const pageInput = document.createElement('input')
  pageInput.type = 'number'
  pageInput.className = 'page-input'
  pageInput.min = '1'
  pageInput.value = '1'
  pageBox.appendChild(pageInput)
  pageBox.appendChild(el('span', 'page-total', '/ 0'))

  const zoomOut = el('button', '', '缩小') as HTMLButtonElement
  const zoomIn = el('button', '', '放大') as HTMLButtonElement

  toolbar.appendChild(prevBtn)
  toolbar.appendChild(nextBtn)
  toolbar.appendChild(pageBox)
  toolbar.appendChild(zoomOut)
  toolbar.appendChild(zoomIn)

  const viewer = el('div', 'viewer-wrap')
  viewer.appendChild(el('div', 'placeholder', '从左侧列表选择一册书开始阅读'))

  const goPage = async (p: number) => {
    if (!pdfDoc) return
    const n = pdfDoc.numPages
    const next = Math.min(n, Math.max(1, Math.floor(p)))
    if (next === currentPage) return
    currentPage = next
    await renderPage()
    updateToolbar(
      toolbar.querySelector('.title')!,
      toolbar.querySelector('.page-total')!,
      pageInput,
      prevBtn,
      nextBtn,
    )
  }

  window.addEventListener('keydown', (ev) => {
    if (!pdfDoc) return
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return
    const ae = document.activeElement
    if (
      ae instanceof HTMLInputElement ||
      ae instanceof HTMLTextAreaElement ||
      (ae instanceof HTMLElement && ae.isContentEditable)
    ) {
      return
    }
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      void goPage(currentPage - 1)
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault()
      void goPage(currentPage + 1)
    }
  })

  prevBtn.addEventListener('click', () => void goPage(currentPage - 1))
  nextBtn.addEventListener('click', () => void goPage(currentPage + 1))

  pageInput.addEventListener('change', () => {
    const v = Number(pageInput.value)
    if (Number.isFinite(v)) void goPage(v)
  })

  zoomOut.addEventListener('click', async () => {
    currentScale = Math.max(0.5, currentScale - 0.15)
    await renderPage()
  })
  zoomIn.addEventListener('click', async () => {
    currentScale = Math.min(3, currentScale + 0.15)
    await renderPage()
  })

  main.appendChild(toolbar)
  main.appendChild(viewer)
  return main
}

async function boot() {
  const layout = el('div', 'layout')
  let manifest: Manifest | null = null
  try {
    manifest = await loadManifest()
    layout.appendChild(renderSidebar(manifest, ''))
  } catch (e) {
    const aside = el('aside', 'sidebar')
    const head = el('div', 'sidebar-header')
    head.appendChild(el('h1', '', '书虫 PDF 阅读器'))
    head.appendChild(
      el('div', 'error', e instanceof Error ? e.message : String(e)),
    )
    aside.appendChild(head)
    layout.appendChild(aside)
  }

  if (manifest) {
    layout.addEventListener('input', (ev) => {
      const t = ev.target
      if (!(t instanceof HTMLInputElement) || !t.classList.contains('search')) return
      const aside = layout.querySelector('.sidebar')
      if (!aside) return
      const val = t.value
      const next = renderSidebar(manifest!, val)
      aside.replaceWith(next)
      const ni = layout.querySelector<HTMLInputElement>('.search')
      if (ni) {
        ni.focus()
        const len = ni.value.length
        ni.setSelectionRange(len, len)
      }
    })
  }

  layout.appendChild(buildMain())
  app.appendChild(layout)
}

void boot()
