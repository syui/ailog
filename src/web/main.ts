import './styles/main.css'
import { getConfig, resolveHandle, getProfile, getPosts, getPost, describeRepo, listRecords, getRecord, getPds, getNetworks, getChatMessages } from './lib/api'
import { parseRoute, onRouteChange, navigate, type Route } from './lib/router'
import { login, logout, handleCallback, restoreSession, isLoggedIn, getLoggedInHandle, getLoggedInDid, deleteRecord, updatePost } from './lib/auth'
import { validateRecord } from './lib/lexicon'
import { renderHeader } from './components/header'
import { renderProfile } from './components/profile'
import { renderPostList, renderPostDetail, setupPostDetail } from './components/posts'
import { renderPostForm, setupPostForm } from './components/postform'
import { renderCollectionButtons, renderServerInfo, renderServiceList, renderCollectionList, renderRecordList, renderRecordDetail } from './components/browser'
import { renderModeTabs, renderLangSelector, setupModeTabs } from './components/mode-tabs'
import { renderFooter } from './components/footer'
import { renderChatListPage, renderChatThreadPage } from './components/chat'
import { showLoading, hideLoading } from './components/loading'

const app = document.getElementById('app')!

let currentHandle = ''
let isFirstRender = true

// Filter collections by service domain
function filterCollectionsByService(collections: string[], service: string): string[] {
  return collections.filter(col => {
    const parts = col.split('.')
    if (parts.length >= 2) {
      const colService = `${parts[1]}.${parts[0]}`
      return colService === service
    }
    return false
  })
}

// Get web URL for handle from networks
async function getWebUrl(handle: string): Promise<string | undefined> {
  const networks = await getNetworks()
  // Check each network for matching handle domain
  for (const [domain, network] of Object.entries(networks)) {
    // Direct domain match (e.g., handle.syu.is -> syu.is)
    if (handle.endsWith(`.${domain}`)) {
      return network.web
    }
    // Check if handle domain matches network's web domain (e.g., syui.syui.ai -> syu.is via web: syu.is)
    const webDomain = network.web?.replace(/^https?:\/\//, '')
    if (webDomain && handle.endsWith(`.${webDomain}`)) {
      return network.web
    }
  }
  // Check for syui.ai handles -> syu.is network
  if (handle.endsWith('.syui.ai')) {
    return networks['syu.is']?.web
  }
  // Default to first network's web
  const firstNetwork = Object.values(networks)[0]
  return firstNetwork?.web
}

async function render(route: Route): Promise<void> {
  // Skip loading indicator on first render for faster perceived performance
  if (!isFirstRender) {
    showLoading(app)
  }

  try {
    const config = await getConfig()

    // Apply theme color from config
    if (config.color) {
      document.documentElement.style.setProperty('--btn-color', config.color)
    }

    // Set page title from config
    if (config.title) {
      document.title = config.title
    }

    // Check OAuth enabled
    const oauthEnabled = config.oauth !== false

    // Handle OAuth callback if present (check both ? and #)
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null
    if (oauthEnabled && (searchParams.has('code') || searchParams.has('state') || hashParams?.has('code') || hashParams?.has('state'))) {
      await handleCallback()
    }

    // Restore session from storage (skip if oauth disabled)
    if (oauthEnabled) {
      await restoreSession()
    }

    // Redirect logged-in user from root to their user page
    if (route.type === 'home' && isLoggedIn()) {
      const loggedInHandle = getLoggedInHandle()
      if (loggedInHandle) {
        navigate({ type: 'user', handle: loggedInHandle })
        return
      }
    }

    // Determine handle and whether to use local data only (no API calls)
    let handle: string
    let localOnly: boolean
    let did: string | null

    if (route.type === 'home') {
      handle = config.handle
      localOnly = true
      did = config.did || null
    } else if (route.handle) {
      handle = route.handle
      localOnly = handle === config.handle
      did = localOnly ? (config.did || null) : null
    } else {
      handle = config.handle
      localOnly = true
      did = config.did || null
    }

    currentHandle = handle

    // Resolve handle to DID only for remote users
    if (!did) {
      did = await resolveHandle(handle)
    }

    if (!did) {
      app.innerHTML = `
        ${renderHeader(handle, oauthEnabled)}
        <div class="error">Could not resolve handle: ${handle}</div>
        ${renderFooter(handle)}
      `
      setupEventHandlers()
      return
    }

    // Load profile (local only for admin, remote for others)
    const profile = await getProfile(did, localOnly)
    const webUrl = await getWebUrl(handle)

    // Load posts (local only for admin, remote for others)
    const posts = await getPosts(did, config.collection, localOnly)

    // Collect available languages from posts (used for non-chat pages)
    const availableLangs = new Set<string>()
    for (const post of posts) {
      // Add original language (default: ja for Japanese posts)
      const postLang = post.value.lang || 'ja'
      availableLangs.add(postLang)
      // Add translation languages
      if (post.value.translations) {
        for (const lang of Object.keys(post.value.translations)) {
          availableLangs.add(lang)
        }
      }
    }
    let langList = Array.from(availableLangs)

    // Build page
    let html = renderHeader(handle, oauthEnabled)

    // Mode tabs (Blog/Browser/Post/Chat/PDS)
    const activeTab = route.type === 'postpage' ? 'post' :
      (route.type === 'chat' || route.type === 'chat-thread') ? 'chat' :
      (route.type === 'atbrowser' || route.type === 'service' || route.type === 'collection' || route.type === 'record' ? 'browser' : 'blog')
    html += renderModeTabs(handle, activeTab, localOnly)

    // Profile section
    if (profile) {
      html += await renderProfile(did, profile, handle, webUrl, localOnly)
    }

    // Check if logged-in user owns this content
    const loggedInDid = getLoggedInDid()
    const isOwner = isLoggedIn() && loggedInDid === did

    // Content section based on route type
    let currentRecord: { uri: string; cid: string; value: unknown } | null = null

    if (route.type === 'record' && route.collection && route.rkey) {
      // AT-Browser: Single record view
      currentRecord = await getRecord(did, route.collection, route.rkey)
      if (currentRecord) {
        html += `<div id="content">${renderRecordDetail(currentRecord, route.collection, isOwner)}</div>`
      } else {
        html += `<div id="content" class="error">Record not found</div>`
      }
      html += `<nav class="back-nav"><a href="/@${handle}/at/collection/${route.collection}">${route.collection}</a></nav>`

    } else if (route.type === 'collection' && route.collection) {
      // AT-Browser: Collection records list
      const records = await listRecords(did, route.collection)
      html += `<div id="content">${renderRecordList(records, handle, route.collection)}</div>`
      const parts = route.collection.split('.')
      const service = parts.length >= 2 ? `${parts[1]}.${parts[0]}` : ''
      html += `<nav class="back-nav"><a href="/@${handle}/at/service/${encodeURIComponent(service)}">${service}</a></nav>`

    } else if (route.type === 'service' && route.service) {
      // AT-Browser: Service collections list
      const collections = await describeRepo(did)
      const filtered = filterCollectionsByService(collections, route.service)
      html += `<div id="content">${renderCollectionList(filtered, handle, route.service)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}/at">at</a></nav>`

    } else if (route.type === 'atbrowser') {
      // AT-Browser: Main view with server info + service list
      const pds = await getPds(did)
      const collections = await describeRepo(did)

      html += `<div id="browser">`
      html += renderServerInfo(did, pds)
      html += renderServiceList(collections, handle)
      html += `</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'post' && route.rkey) {
      // Post detail (config.collection with markdown)
      const post = await getPost(did, config.collection, route.rkey, localOnly)
      html += renderLangSelector(langList)
      if (post) {
        html += `<div id="content">${renderPostDetail(post, handle, config.collection, isOwner, config.siteUrl, webUrl)}</div>`
      } else {
        html += `<div id="content" class="error">Post not found</div>`
      }
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'postpage') {
      // Post form page
      html += `<div id="post-form">${renderPostForm(config.collection)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'chat') {
      // Chat list page - show threads started by this user
      const aiDid = 'did:plc:6qyecktefllvenje24fcxnie' // ai.syui.ai
      const aiHandle = 'ai.syui.ai'

      // Load messages for the current user (did) and bot
      const chatMessages = await getChatMessages(did, aiDid, 'ai.syui.log.chat')
      const aiProfile = await getProfile(aiDid, false)
      const pds = await getPds(did)

      // Collect available languages from chat messages
      const chatLangs = new Set<string>()
      for (const msg of chatMessages) {
        const msgLang = msg.value.lang || 'ja'
        chatLangs.add(msgLang)
        if (msg.value.translations) {
          for (const lang of Object.keys(msg.value.translations)) {
            chatLangs.add(lang)
          }
        }
      }
      langList = Array.from(chatLangs)

      html += renderLangSelector(langList)
      html += `<div id="content">${renderChatListPage(chatMessages, did, handle, aiDid, aiHandle, profile, aiProfile, pds || undefined)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'chat-thread' && route.rkey) {
      // Chat thread page - show full conversation
      const aiDid = 'did:plc:6qyecktefllvenje24fcxnie' // ai.syui.ai
      const aiHandle = 'ai.syui.ai'

      const chatMessages = await getChatMessages(did, aiDid, 'ai.syui.log.chat')
      const aiProfile = await getProfile(aiDid, false)
      const pds = await getPds(did)

      // Collect available languages from chat messages
      const chatLangs = new Set<string>()
      for (const msg of chatMessages) {
        const msgLang = msg.value.lang || 'ja'
        chatLangs.add(msgLang)
        if (msg.value.translations) {
          for (const lang of Object.keys(msg.value.translations)) {
            chatLangs.add(lang)
          }
        }
      }
      langList = Array.from(chatLangs)

      html += renderLangSelector(langList)
      html += `<div id="content">${renderChatThreadPage(chatMessages, route.rkey, did, handle, aiDid, aiHandle, profile, aiProfile, pds || undefined)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}/at/chat">chat</a></nav>`

    } else {
      // User page: compact collection buttons + posts
      const collections = await describeRepo(did)
      html += `<div id="browser">${renderCollectionButtons(collections, handle)}</div>`

      // Language selector above content
      html += renderLangSelector(langList)

      // Use pre-loaded posts
      html += `<div id="content">${renderPostList(posts, handle)}</div>`
    }

    html += renderFooter(handle)

    app.innerHTML = html
    hideLoading(app)
    setupEventHandlers()

    // Setup mode tabs (PDS selector + Lang selector)
    await setupModeTabs(
      (_network) => {
        // Refresh when network is changed
        render(parseRoute())
      },
      langList,
      (_lang) => {
        // Refresh when language is changed
        render(parseRoute())
      }
    )

    // Setup post form on postpage
    if (route.type === 'postpage' && isLoggedIn()) {
      setupPostForm(config.collection, () => {
        // Navigate to user page on success
        navigate({ type: 'user', handle })
      })
    }

    // Setup record delete button
    if (isOwner) {
      setupRecordDelete(handle, route)
      setupPostEdit(config.collection)
    }

    // Setup validate button for record detail
    if (currentRecord) {
      setupValidateButton(currentRecord)
    }

    // Setup post detail (translation toggle, discussion)
    if (route.type === 'post') {
      const contentEl = document.getElementById('content')
      if (contentEl) {
        setupPostDetail(contentEl)
      }
    }

  } catch (error) {
    console.error('Render error:', error)
    app.innerHTML = `
      ${renderHeader(currentHandle, false)}
      <div class="error">Error: ${error}</div>
      ${renderFooter(currentHandle)}
    `
    hideLoading(app)
    setupEventHandlers()
  } finally {
    isFirstRender = false
  }
}

function setupEventHandlers(): void {
  // Header form
  const form = document.getElementById('header-form') as HTMLFormElement
  const input = document.getElementById('header-input') as HTMLInputElement

  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    const handle = input.value.trim()
    if (handle) {
      navigate({ type: 'user', handle })
    }
  })

  // Login button
  const loginBtn = document.getElementById('login-btn')
  loginBtn?.addEventListener('click', async () => {
    const handle = input.value.trim() || currentHandle
    if (handle) {
      try {
        await login(handle)
      } catch (e) {
        console.error('Login failed:', e)
        alert('Login failed. Please check your handle.')
      }
    } else {
      alert('Please enter a handle first.')
    }
  })

  // Logout button
  const logoutBtn = document.getElementById('logout-btn')
  logoutBtn?.addEventListener('click', async () => {
    await logout()
  })
}

// Setup validate button for record detail
function setupValidateButton(record: { value: unknown }): void {
  const validateBtn = document.getElementById('validate-btn')
  const resultDiv = document.getElementById('validate-result')
  if (!validateBtn || !resultDiv) return

  validateBtn.addEventListener('click', async () => {
    const collection = validateBtn.getAttribute('data-collection')
    if (!collection) return

    // Show loading state
    validateBtn.textContent = 'Validating...'
    ;(validateBtn as HTMLButtonElement).disabled = true
    resultDiv.innerHTML = ''

    try {
      const result = await validateRecord(collection, record.value)

      if (result.valid) {
        resultDiv.innerHTML = `<span class="validate-valid">✓ Valid</span>`
      } else {
        resultDiv.innerHTML = `
          <span class="validate-invalid">✗ Invalid</span>
          <span class="validate-error">${result.error || 'Unknown error'}</span>
        `
      }
    } catch (err) {
      resultDiv.innerHTML = `
        <span class="validate-invalid">✗ Error</span>
        <span class="validate-error">${err}</span>
      `
    }

    validateBtn.textContent = 'Validate'
    ;(validateBtn as HTMLButtonElement).disabled = false
  })
}

// Setup record delete button
function setupRecordDelete(handle: string, _route: Route): void {
  const deleteBtn = document.getElementById('record-delete-btn')
  if (!deleteBtn) return

  deleteBtn.addEventListener('click', async () => {
    const collection = deleteBtn.getAttribute('data-collection')
    const rkey = deleteBtn.getAttribute('data-rkey')

    if (!collection || !rkey) return

    if (!confirm('Are you sure you want to delete this record?')) return

    try {
      deleteBtn.textContent = 'Deleting...'
      ;(deleteBtn as HTMLButtonElement).disabled = true

      await deleteRecord(collection, rkey)

      // Navigate back to collection list
      navigate({ type: 'collection', handle, collection })
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Delete failed: ' + err)
      deleteBtn.textContent = 'Delete'
      ;(deleteBtn as HTMLButtonElement).disabled = false
    }
  })
}

// Setup post edit form
function setupPostEdit(collection: string): void {
  const editBtn = document.getElementById('post-edit-btn')
  const editForm = document.getElementById('post-edit-form')
  const postDisplay = document.getElementById('post-display')
  const cancelBtn = document.getElementById('post-edit-cancel')
  const saveBtn = document.getElementById('post-edit-save')
  const titleInput = document.getElementById('post-edit-title') as HTMLInputElement
  const contentInput = document.getElementById('post-edit-content') as HTMLTextAreaElement

  if (!editBtn || !editForm) return

  // Show edit form
  editBtn.addEventListener('click', () => {
    if (postDisplay) postDisplay.style.display = 'none'
    editForm.style.display = 'block'
    editBtn.style.display = 'none'
  })

  // Cancel edit
  cancelBtn?.addEventListener('click', () => {
    editForm.style.display = 'none'
    if (postDisplay) postDisplay.style.display = ''
    editBtn.style.display = ''
  })

  // Save edit
  saveBtn?.addEventListener('click', async () => {
    const rkey = saveBtn.getAttribute('data-rkey')
    if (!rkey || !titleInput || !contentInput) return

    const title = titleInput.value.trim()
    const content = contentInput.value.trim()

    if (!title || !content) {
      alert('Title and content are required')
      return
    }

    try {
      saveBtn.textContent = 'Saving...'
      ;(saveBtn as HTMLButtonElement).disabled = true

      await updatePost(collection, rkey, title, content)

      // Refresh the page
      render(parseRoute())
    } catch (err) {
      console.error('Update failed:', err)
      alert('Update failed: ' + err)
      saveBtn.textContent = 'Save'
      ;(saveBtn as HTMLButtonElement).disabled = false
    }
  })
}

// Initial render
render(parseRoute())

// Handle route changes
onRouteChange(render)
