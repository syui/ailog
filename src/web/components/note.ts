import { renderMarkdown } from '../lib/markdown'
import type { Post } from '../types'

// Note post has extra fields for member content
interface NotePost extends Post {
  value: Post['value'] & {
    member?: {
      text: string
      bonus?: string
    }
  }
}

// Render note list page
export function renderNoteListPage(posts: NotePost[], handle: string): string {
  if (posts.length === 0) {
    return `<div class="note-empty">No note articles yet.</div>`
  }

  const items = posts.map(post => {
    const rkey = post.uri.split('/').pop() || ''
    const date = new Date(post.value.publishedAt).toLocaleDateString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const tags = post.value.tags?.map(t => `<span class="note-tag">${t}</span>`).join('') || ''

    return `
      <div class="note-item">
        <a href="/@${handle}/at/note/${rkey}" class="note-link">
          <span class="note-date">${date}</span>
          <span class="note-title">${escapeHtml(post.value.title)}</span>
        </a>
        ${tags ? `<div class="note-tags">${tags}</div>` : ''}
      </div>
    `
  }).join('')

  return `<div class="note-list">${items}</div>`
}

// Render single note detail with preview + copy
export function renderNoteDetailPage(
  post: NotePost,
  _handle: string,
  localOnly: boolean
): string {
  const rkey = post.uri.split('/').pop() || ''
  const date = new Date(post.value.publishedAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  const freeText = post.value.content?.text || ''
  const memberText = post.value.member?.text || ''
  const bonusText = post.value.member?.bonus || ''

  const freeHtml = renderMarkdown(freeText)
  const memberHtml = memberText ? renderMarkdown(memberText) : ''
  const bonusHtml = bonusText ? renderMarkdown(bonusText) : ''

  let html = ''

  // Action buttons at top
  if (localOnly) {
    html += `
      <div class="note-actions">
        <button type="button" class="note-copy-btn" id="note-copy-title">Copy Title</button>
        <button type="button" class="note-copy-btn" id="note-copy-all">Copy 全文</button>
        <button type="button" class="note-copy-btn" id="note-edit-btn">Edit</button>
        <span id="note-copy-status" class="note-copy-status"></span>
      </div>
    `
  }

  html += `
    <div class="note-detail" id="note-display">
      <h2 class="note-detail-title">${escapeHtml(post.value.title)}</h2>
      <div class="note-detail-meta">${date}</div>

      <div class="note-section">
        <div class="note-section-label">本文（無料）</div>
        <div class="note-content">${freeHtml}</div>
      </div>
  `

  if (memberText) {
    html += `
      <div class="note-paywall">── 有料ライン ──</div>
      <div class="note-section">
        <div class="note-section-label">答えと核心（有料）</div>
        <div class="note-content">${memberHtml}</div>
      </div>
    `
  }

  if (bonusText) {
    html += `
      <div class="note-section">
        <div class="note-section-label">今日のひとこま（おまけ）</div>
        <div class="note-content">${bonusHtml}</div>
      </div>
    `
  }

  html += `</div>`

  // Edit form (below content)
  if (localOnly) {
    html += `
      <div class="note-edit" id="note-edit-form" style="display:none">
        <input type="text" id="note-edit-title" class="note-edit-input" value="${escapeAttr(post.value.title)}" placeholder="Title">
        <label class="note-edit-label">本文（無料）</label>
        <textarea id="note-edit-free" class="note-edit-textarea" rows="10">${escapeHtml(freeText)}</textarea>
        <label class="note-edit-label">答えと核心（有料）</label>
        <textarea id="note-edit-member" class="note-edit-textarea" rows="8">${escapeHtml(memberText)}</textarea>
        <label class="note-edit-label">今日のひとこま（おまけ）</label>
        <textarea id="note-edit-bonus" class="note-edit-textarea" rows="5">${escapeHtml(bonusText)}</textarea>
        <div class="note-edit-actions">
          <button type="button" id="note-edit-save" data-rkey="${rkey}">Copy JSON</button>
          <button type="button" id="note-edit-cancel">Cancel</button>
        </div>
        <div id="note-edit-status"></div>
      </div>
    `
  }

  return html
}

// Setup note detail page (copy + edit handlers)
export function setupNoteDetail(
  post: NotePost,
  _onSave?: (rkey: string, record: Record<string, unknown>) => Promise<void>
): void {
  const freeText = post.value.content?.text || ''
  const memberText = post.value.member?.text || ''
  const bonusText = post.value.member?.bonus || ''

  // Copy buttons
  const copyTitle = document.getElementById('note-copy-title')
  const copyAll = document.getElementById('note-copy-all')
  const copyStatus = document.getElementById('note-copy-status')

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      if (copyStatus) {
        copyStatus.textContent = 'Copied!'
        setTimeout(() => { copyStatus.textContent = '' }, 2000)
      }
    })
  }

  copyTitle?.addEventListener('click', () => copyToClipboard(post.value.title))
  copyAll?.addEventListener('click', () => {
    const parts = [freeText, memberText, bonusText].filter(Boolean)
    copyToClipboard(parts.join('\n\n'))
  })

  // Edit toggle
  const editBtn = document.getElementById('note-edit-btn')
  const editForm = document.getElementById('note-edit-form')
  const display = document.getElementById('note-display')
  const cancelBtn = document.getElementById('note-edit-cancel')
  const saveBtn = document.getElementById('note-edit-save')

  editBtn?.addEventListener('click', () => {
    if (display) display.style.display = 'none'
    if (editForm) editForm.style.display = 'block'
    if (editBtn) editBtn.style.display = 'none'
  })

  cancelBtn?.addEventListener('click', () => {
    if (editForm) editForm.style.display = 'none'
    if (display) display.style.display = ''
    if (editBtn) editBtn.style.display = ''
  })

  saveBtn?.addEventListener('click', () => {
    const rkey = saveBtn.getAttribute('data-rkey')
    if (!rkey) return

    const title = (document.getElementById('note-edit-title') as HTMLInputElement)?.value.trim()
    const free = (document.getElementById('note-edit-free') as HTMLTextAreaElement)?.value.trim()
    const member = (document.getElementById('note-edit-member') as HTMLTextAreaElement)?.value.trim()
    const bonus = (document.getElementById('note-edit-bonus') as HTMLTextAreaElement)?.value.trim()

    if (!title || !free) {
      alert('Title and content are required')
      return
    }

    const did = post.uri.split('/')[2]
    const record: Record<string, unknown> = {
      cid: '',
      uri: post.uri,
      value: {
        $type: 'ai.syui.note.post',
        site: post.value.site,
        title,
        content: {
          $type: 'ai.syui.note.post#markdown',
          text: free,
        },
        publishedAt: post.value.publishedAt,
        langs: post.value.langs || ['ja'],
        tags: post.value.tags || [],
      } as Record<string, unknown>,
    }

    if (member || bonus) {
      const memberObj: Record<string, string> = {}
      if (member) memberObj.text = member
      if (bonus) memberObj.bonus = bonus
      ;(record.value as Record<string, unknown>).member = memberObj
    }

    const json = JSON.stringify(record, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      const statusEl = document.getElementById('note-edit-status')
      const filePath = `public/at/${did}/ai.syui.note.post/${rkey}.json`
      if (statusEl) {
        statusEl.innerHTML = `<span class="note-copy-status">JSON copied! Paste to: <code>${filePath}</code></span>`
      }
    })
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
