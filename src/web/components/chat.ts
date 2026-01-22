import type { ChatMessage, Profile } from '../types'
import { renderMarkdown } from '../lib/markdown'
import { getCurrentLang } from './mode-tabs'

// Get translated content for a chat message
function getTranslatedContent(msg: ChatMessage): string {
  const currentLang = getCurrentLang()
  const originalLang = msg.value.lang || 'ja'
  const translations = msg.value.translations

  if (translations && currentLang !== originalLang && translations[currentLang]) {
    return translations[currentLang].content || msg.value.content
  }
  return msg.value.content
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Format date/time for chat
function formatChatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${min}`
}

// Extract rkey from AT URI
function getRkeyFromUri(uri: string): string {
  return uri.split('/').pop() || ''
}

// Profile info for authors
interface AuthorInfo {
  did: string
  handle: string
  avatarUrl?: string
}

// Build author info map
function buildAuthorMap(
  userDid: string,
  userHandle: string,
  botDid: string,
  botHandle: string,
  userProfile?: Profile | null,
  botProfile?: Profile | null,
  pds?: string
): Map<string, AuthorInfo> {
  const authors = new Map<string, AuthorInfo>()

  // User info
  let userAvatarUrl = ''
  if (userProfile?.value.avatar) {
    const cid = userProfile.value.avatar.ref.$link
    userAvatarUrl = pds ? `${pds}/xrpc/com.atproto.sync.getBlob?did=${userDid}&cid=${cid}` : `/content/${userDid}/blob/${cid}`
  }
  authors.set(userDid, { did: userDid, handle: userHandle, avatarUrl: userAvatarUrl })

  // Bot info
  let botAvatarUrl = ''
  if (botProfile?.value.avatar) {
    const cid = botProfile.value.avatar.ref.$link
    botAvatarUrl = pds ? `${pds}/xrpc/com.atproto.sync.getBlob?did=${botDid}&cid=${cid}` : `/content/${botDid}/blob/${cid}`
  }
  authors.set(botDid, { did: botDid, handle: botHandle, avatarUrl: botAvatarUrl })

  return authors
}

// Render chat threads list (conversations this user started)
export function renderChatThreadList(
  messages: ChatMessage[],
  userDid: string,
  userHandle: string,
  botDid: string,
  botHandle: string,
  userProfile?: Profile | null,
  botProfile?: Profile | null,
  pds?: string
): string {
  // Build set of all message URIs
  const allUris = new Set(messages.map(m => m.uri))

  // Find root messages by this user:
  // 1. No root field (explicit start of conversation)
  // 2. Or root points to non-existent message (orphaned, treat as root)
  //    For orphaned roots, only keep the oldest message per orphaned root URI
  const orphanedRootFirstMsg = new Map<string, ChatMessage>()
  const rootMessages: ChatMessage[] = []

  for (const msg of messages) {
    if (msg.value.author !== userDid) continue

    if (!msg.value.root) {
      // No root = explicit conversation start
      rootMessages.push(msg)
    } else if (!allUris.has(msg.value.root)) {
      // Orphaned root - keep only the oldest message per orphaned root
      const existing = orphanedRootFirstMsg.get(msg.value.root)
      if (!existing || new Date(msg.value.createdAt) < new Date(existing.value.createdAt)) {
        orphanedRootFirstMsg.set(msg.value.root, msg)
      }
    }
  }

  // Add orphaned root representatives
  for (const msg of orphanedRootFirstMsg.values()) {
    rootMessages.push(msg)
  }

  if (rootMessages.length === 0) {
    return '<p class="no-posts">No chat threads yet.</p>'
  }

  const authors = buildAuthorMap(userDid, userHandle, botDid, botHandle, userProfile, botProfile, pds)

  // Sort by createdAt (newest first)
  const sorted = [...rootMessages].sort((a, b) =>
    new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
  )

  const items = sorted.map(msg => {
    const authorDid = msg.value.author
    const time = formatChatTime(msg.value.createdAt)
    const rkey = getRkeyFromUri(msg.uri)
    const author = authors.get(authorDid) || { did: authorDid, handle: authorDid.slice(0, 20) + '...' }

    const avatarHtml = author.avatarUrl
      ? `<img class="chat-avatar" src="${author.avatarUrl}" alt="@${escapeHtml(author.handle)}">`
      : `<div class="chat-avatar-placeholder"></div>`

    // Truncate content for preview (use translated content, show first 3 lines)
    const displayContent = getTranslatedContent(msg)
    const lines = displayContent.split('\n').slice(0, 3)
    const preview = lines.join('\n')

    return `
      <a href="/@${userHandle}/at/chat/${rkey}" class="chat-thread-item">
        <div class="chat-avatar-col">
          ${avatarHtml}
        </div>
        <div class="chat-thread-content">
          <div class="chat-thread-header">
            <span class="chat-author">@${escapeHtml(author.handle)}</span>
            <span class="chat-time">${time}</span>
          </div>
          <div class="chat-thread-preview">${escapeHtml(preview)}</div>
        </div>
      </a>
    `
  }).join('')

  return `<div class="chat-thread-list">${items}</div>`
}

// Render single chat thread (full conversation)
export function renderChatThread(
  messages: ChatMessage[],
  rootRkey: string,
  userDid: string,
  userHandle: string,
  botDid: string,
  botHandle: string,
  userProfile?: Profile | null,
  botProfile?: Profile | null,
  pds?: string,
  chatCollection: string = 'ai.syui.log.chat',
  loggedInDid?: string | null
): string {
  // Find root message
  const rootUri = `at://${userDid}/${chatCollection}/${rootRkey}`
  const rootMsg = messages.find(m => m.uri === rootUri)

  if (!rootMsg) {
    return '<p class="error">Chat thread not found.</p>'
  }

  // Find all messages in this thread
  // 1. The root message itself
  // 2. Messages with root === rootUri (direct children)
  // 3. If this is an orphaned root (root points to non-existent), find siblings with same original root
  const originalRoot = rootMsg.value.root
  const allUris = new Set(messages.map(m => m.uri))
  const isOrphanedRoot = originalRoot && !allUris.has(originalRoot)

  const threadMessages = messages.filter(msg => {
    // Include the root message itself
    if (msg.uri === rootUri) return true
    // Include messages that point to this as root
    if (msg.value.root === rootUri) return true
    // If orphaned, include messages with the same original root
    if (isOrphanedRoot && msg.value.root === originalRoot) return true
    return false
  })

  if (threadMessages.length === 0) {
    return '<p class="error">No messages in this thread.</p>'
  }

  const authors = buildAuthorMap(userDid, userHandle, botDid, botHandle, userProfile, botProfile, pds)

  // Sort by createdAt
  const sorted = [...threadMessages].sort((a, b) =>
    new Date(a.value.createdAt).getTime() - new Date(b.value.createdAt).getTime()
  )

  const items = sorted.map(msg => {
    const authorDid = msg.value.author
    const time = formatChatTime(msg.value.createdAt)
    const rkey = getRkeyFromUri(msg.uri)
    const author = authors.get(authorDid) || { did: authorDid, handle: authorDid.slice(0, 20) + '...' }

    const avatarHtml = author.avatarUrl
      ? `<img class="chat-avatar" src="${author.avatarUrl}" alt="@${escapeHtml(author.handle)}">`
      : `<div class="chat-avatar-placeholder"></div>`

    const displayContent = getTranslatedContent(msg)
    const content = renderMarkdown(displayContent)
    const recordLink = `/@${author.handle}/at/collection/${chatCollection}/${rkey}`
    const canEdit = loggedInDid && authorDid === loggedInDid
    const editLink = `/@${userHandle}/at/chat/${rkey}/edit`

    return `
      <article class="chat-message">
        <div class="chat-avatar-col">
          ${avatarHtml}
        </div>
        <div class="chat-content-col">
          <div class="chat-message-header">
            <a href="/@${author.handle}" class="chat-author">@${escapeHtml(author.handle)}</a>
            <a href="${recordLink}" class="chat-time">${time}</a>
            ${canEdit ? `<a href="${editLink}" class="chat-edit-btn">edit</a>` : ''}
          </div>
          <div class="chat-content">${content}</div>
        </div>
      </article>
    `
  }).join('')

  return `<div class="chat-list">${items}</div>`
}

// Render chat list page
export function renderChatListPage(
  messages: ChatMessage[],
  userDid: string,
  userHandle: string,
  botDid: string,
  botHandle: string,
  userProfile?: Profile | null,
  botProfile?: Profile | null,
  pds?: string
): string {
  const list = renderChatThreadList(messages, userDid, userHandle, botDid, botHandle, userProfile, botProfile, pds)
  return `<div class="chat-container">${list}</div>`
}

// Render chat thread page
export function renderChatThreadPage(
  messages: ChatMessage[],
  rootRkey: string,
  userDid: string,
  userHandle: string,
  botDid: string,
  botHandle: string,
  userProfile?: Profile | null,
  botProfile?: Profile | null,
  pds?: string,
  chatCollection: string = 'ai.syui.log.chat',
  loggedInDid?: string | null
): string {
  const thread = renderChatThread(messages, rootRkey, userDid, userHandle, botDid, botHandle, userProfile, botProfile, pds, chatCollection, loggedInDid)
  return `<div class="chat-container">${thread}</div>`
}

// Render chat edit form
export function renderChatEditForm(
  message: ChatMessage,
  collection: string,
  userHandle: string
): string {
  const rkey = message.uri.split('/').pop() || ''
  const content = message.value.content

  return `
    <div class="chat-edit-container">
      <h2>Edit Chat Message</h2>
      <form class="chat-edit-form" id="chat-edit-form">
        <textarea
          class="chat-edit-content"
          id="chat-edit-content"
          rows="10"
          required
        >${escapeHtml(content)}</textarea>
        <div class="chat-edit-footer">
          <span class="chat-edit-collection">${collection}</span>
          <div class="chat-edit-buttons">
            <a href="/@${userHandle}/at/chat/${rkey}" class="chat-edit-cancel">Cancel</a>
            <button type="submit" class="chat-edit-save" id="chat-edit-save" data-rkey="${rkey}">Save</button>
          </div>
        </div>
      </form>
      <div id="chat-edit-status" class="chat-edit-status"></div>
    </div>
  `
}
