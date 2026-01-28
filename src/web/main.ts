import './styles/main.css'
import './styles/card.css'
import './styles/card-migrate.css'
import { getConfig, resolveHandle, getProfile, getPosts, getPost, describeRepo, listRecords, getRecord, getPds, getNetworks, getChatMessages, getCards, getCardAdmin, getRse, getRseAdmin, getLinks } from './lib/api'
import { parseRoute, onRouteChange, navigate, type Route } from './lib/router'
import { login, logout, handleCallback, restoreSession, isLoggedIn, getLoggedInHandle, getLoggedInDid, deleteRecord, updatePost, updateChat, updateLinks } from './lib/auth'
import { validateRecord } from './lib/lexicon'
import { renderHeader } from './components/header'
import { renderProfile } from './components/profile'
import { renderPostList, renderPostDetail, setupPostDetail } from './components/posts'
import { renderPostForm, setupPostForm } from './components/postform'
import { renderCollectionButtons, renderServerInfo, renderServiceList, renderCollectionList, renderRecordList, renderRecordDetail } from './components/browser'
import { renderModeTabs, renderLangSelector, setupModeTabs } from './components/mode-tabs'
import { renderFooter } from './components/footer'
import { renderChatListPage, renderChatThreadPage, renderChatEditForm } from './components/chat'
import { renderCardPage } from './components/card'
import { renderRsePage } from './components/rse'
import { renderLinkPage, renderLinkButtons } from './components/link'
import { checkMigrationStatus, renderMigrationPage, setupMigrationButton } from './components/card-migrate'
import { showLoading, hideLoading } from './components/loading'

const app = document.getElementById('app')!

let currentHandle = ''
let configHandle = ''
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
  for (const [_domain, network] of Object.entries(networks)) {
    // Check handleDomains if configured
    if (network.handleDomains) {
      for (const hd of network.handleDomains) {
        if (handle.endsWith(`.${hd}`)) {
          return network.web
        }
      }
    }
    // Check if handle domain matches network's web domain
    const webDomain = network.web?.replace(/^https?:\/\//, '')
    if (webDomain && handle.endsWith(`.${webDomain}`)) {
      return network.web
    }
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
    configHandle = config.handle

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
        ${renderFooter(config.handle, config.repoUrl)}
      `
      setupEventHandlers()
      return
    }

    // Load profile and collections (local only for admin, remote for others)
    const [profile, webUrl, collections] = await Promise.all([
      getProfile(did, localOnly),
      getWebUrl(handle),
      describeRepo(did)
    ])

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

    // Mode tabs (Blog/Browser/Post/Chat/Link/PDS)
    const activeTab = route.type === 'postpage' ? 'post' :
      (route.type === 'chat' || route.type === 'chat-thread' || route.type === 'chat-edit') ? 'chat' :
      route.type === 'link' ? 'link' :
      (route.type === 'atbrowser' || route.type === 'service' || route.type === 'collection' || route.type === 'record' ? 'browser' : 'blog')
    html += renderModeTabs(handle, activeTab, localOnly)

    // Check if logged-in user owns this content
    const loggedInDid = getLoggedInDid()
    const isOwner = isLoggedIn() && loggedInDid === did

    // Profile section
    if (profile) {
      html += await renderProfile(did, profile, handle, webUrl, localOnly, collections)
    }

    // Content section based on route type
    let currentRecord: { uri: string; cid: string; value: unknown } | null = null
    let cardMigrationState: Awaited<ReturnType<typeof checkMigrationStatus>> | null = null

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
      // AT-Browser: Service collections list (use pre-loaded collections)
      const filtered = filterCollectionsByService(collections, route.service)
      html += `<div id="content">${renderCollectionList(filtered, handle, route.service)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}/at">at</a></nav>`

    } else if (route.type === 'atbrowser') {
      // AT-Browser: Main view with server info + service list (use pre-loaded collections)
      const pds = await getPds(did)

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

    } else if (route.type === 'card') {
      // Card collection page
      const cardCollection = config.cardCollection || 'ai.syui.card.user'
      const cards = await getCards(did, cardCollection)
      html += `<div id="content">${renderCardPage(cards, handle, cardCollection)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'card-old') {
      // Card migration page
      cardMigrationState = await checkMigrationStatus(did)
      html += `<div id="content">${renderMigrationPage(cardMigrationState, handle, isOwner)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'rse') {
      // RSE page with character cards
      const cardCollection = config.cardCollection || 'ai.syui.card.user'
      const adminDid = config.bot?.did || config.did || did
      const [rseData, cards, adminData, rseAdminData] = await Promise.all([
        getRse(did),
        getCards(did, cardCollection),
        getCardAdmin(adminDid),
        getRseAdmin(adminDid)
      ])
      const userCards = cards?.card || []
      html += `<div id="content">${renderRsePage(rseData, handle, userCards, adminData, rseAdminData)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'link') {
      // Link page
      const links = await getLinks(did)
      html += `<div id="content">${renderLinkPage(links, handle, isOwner)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`

    } else if (route.type === 'chat') {
      // Chat list page - show threads started by this user
      if (!config.bot) {
        html += `<div id="content" class="error">Bot not configured in config.json</div>`
        html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`
      } else {
      const botDid = config.bot.did
      const botHandle = config.bot.handle
      const chatCollection = config.chatCollection || 'ai.syui.log.chat'

      // Load messages and profiles in parallel
      const [chatMessages, botProfile, pds] = await Promise.all([
        getChatMessages(did, botDid, chatCollection),
        getProfile(botDid, false),
        getPds(did)
      ])

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
      html += `<div id="content">${renderChatListPage(chatMessages, did, handle, botDid, botHandle, profile, botProfile, pds || undefined)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`
      }

    } else if (route.type === 'chat-thread' && route.rkey) {
      // Chat thread page - show full conversation
      if (!config.bot) {
        html += `<div id="content" class="error">Bot not configured in config.json</div>`
        html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`
      } else {
      const botDid = config.bot.did
      const botHandle = config.bot.handle
      const chatCollection = config.chatCollection || 'ai.syui.log.chat'

      // Load messages and profiles in parallel
      const [chatMessages, botProfile, pds] = await Promise.all([
        getChatMessages(did, botDid, chatCollection),
        getProfile(botDid, false),
        getPds(did)
      ])

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
      html += `<div id="content">${renderChatThreadPage(chatMessages, route.rkey, did, handle, botDid, botHandle, profile, botProfile, pds || undefined, chatCollection, loggedInDid)}</div>`
      html += `<nav class="back-nav"><a href="/@${handle}/at/chat">chat</a></nav>`
      }

    } else if (route.type === 'chat-edit' && route.rkey) {
      // Chat edit page
      if (!config.bot) {
        html += `<div id="content" class="error">Bot not configured in config.json</div>`
        html += `<nav class="back-nav"><a href="/@${handle}">${handle}</a></nav>`
      } else if (!isOwner) {
        html += `<div id="content" class="error">You can only edit your own messages</div>`
        html += `<nav class="back-nav"><a href="/@${handle}/at/chat">chat</a></nav>`
      } else {
        const botDid = config.bot.did
        const chatCollection = config.chatCollection || 'ai.syui.log.chat'

        // Get the specific message
        const chatMessages = await getChatMessages(did, botDid, chatCollection)
        const targetUri = `at://${did}/${chatCollection}/${route.rkey}`
        const message = chatMessages.find(m => m.uri === targetUri)

        if (!message) {
          html += `<div id="content" class="error">Message not found</div>`
        } else {
          html += `<div id="content">${renderChatEditForm(message, chatCollection, handle)}</div>`
        }
        html += `<nav class="back-nav"><a href="/@${handle}/at/chat">chat</a></nav>`
      }

    } else {
      // User page: compact collection buttons + link buttons + posts
      const links = await getLinks(did)
      html += `<div id="browser" class="browser-row">${renderCollectionButtons(collections, handle)}${renderLinkButtons(links)}</div>`

      // Language selector above content
      html += renderLangSelector(langList)

      // Use pre-loaded posts
      html += `<div id="content">${renderPostList(posts, handle)}</div>`
    }

    html += renderFooter(config.handle, config.repoUrl)

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

    // Setup chat edit form
    if (route.type === 'chat-edit' && isOwner) {
      const chatCollection = config.chatCollection || 'ai.syui.log.chat'
      setupChatEdit(chatCollection, handle)
    }

    // Setup link edit
    if (route.type === 'link' && isOwner) {
      setupLinkEdit()
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

    // Setup card migration button
    if (route.type === 'card-old' && cardMigrationState?.oldApiUser && cardMigrationState?.oldApiCards) {
      setupMigrationButton(
        cardMigrationState.oldApiUser,
        cardMigrationState.oldApiCards,
        () => render(parseRoute())  // Refresh on success
      )
    }

  } catch (error) {
    console.error('Render error:', error)
    app.innerHTML = `
      ${renderHeader(currentHandle, false)}
      <div class="error">Error: ${error}</div>
      ${renderFooter(configHandle, undefined)}
    `
    setupEventHandlers()
  } finally {
    hideLoading(app)
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

// Setup chat edit form
function setupChatEdit(collection: string, handle: string): void {
  const form = document.getElementById('chat-edit-form') as HTMLFormElement
  const contentInput = document.getElementById('chat-edit-content') as HTMLTextAreaElement
  const saveBtn = document.getElementById('chat-edit-save') as HTMLButtonElement
  const statusEl = document.getElementById('chat-edit-status') as HTMLDivElement

  if (!form || !saveBtn) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const rkey = saveBtn.getAttribute('data-rkey')
    if (!rkey || !contentInput) return

    const content = contentInput.value.trim()

    if (!content) {
      alert('Content is required')
      return
    }

    try {
      saveBtn.textContent = 'Saving...'
      saveBtn.disabled = true

      await updateChat(collection, rkey, content)

      statusEl.innerHTML = '<span class="chat-edit-success">Saved!</span>'

      // Navigate back to chat thread
      setTimeout(() => {
        navigate({ type: 'chat-thread', handle, rkey })
      }, 1000)
    } catch (err) {
      console.error('Update failed:', err)
      statusEl.innerHTML = `<span class="chat-edit-error">Error: ${err}</span>`
      saveBtn.textContent = 'Save'
      saveBtn.disabled = false
    }
  })
}

// Setup link edit
function setupLinkEdit(): void {
  const editBtn = document.getElementById('link-edit-btn')
  const editForm = document.getElementById('link-edit-form')
  const linkDisplay = document.getElementById('link-display')
  const editList = document.getElementById('link-edit-list')
  const cancelBtn = document.getElementById('link-edit-cancel')
  const saveBtn = document.getElementById('link-edit-save')
  const addBtn = document.getElementById('link-add-btn')
  const addService = document.getElementById('link-add-service') as HTMLSelectElement
  const addUsername = document.getElementById('link-add-username') as HTMLInputElement
  const statusEl = document.getElementById('link-edit-status')

  if (!editBtn || !editForm || !editList) return

  let linkIndex = editList.querySelectorAll('.link-edit-item').length

  // Show edit form
  editBtn.addEventListener('click', () => {
    if (linkDisplay) linkDisplay.style.display = 'none'
    editForm.style.display = 'block'
    editBtn.style.display = 'none'
  })

  // Cancel edit
  cancelBtn?.addEventListener('click', () => {
    editForm.style.display = 'none'
    if (linkDisplay) linkDisplay.style.display = ''
    editBtn.style.display = ''
  })

  // Add new link
  addBtn?.addEventListener('click', () => {
    const service = addService.value
    const username = addUsername.value.trim()
    if (!username) return

    const serviceNames: Record<string, string> = { github: 'GitHub', x: 'X', youtube: 'YouTube' }
    const options = ['github', 'x', 'youtube'].map(s =>
      `<option value="${s}" ${s === service ? 'selected' : ''}>${serviceNames[s]}</option>`
    ).join('')

    const newItem = document.createElement('div')
    newItem.className = 'link-edit-item'
    newItem.dataset.index = String(linkIndex++)
    newItem.innerHTML = `
      <select class="link-edit-service" data-index="${newItem.dataset.index}">
        ${options}
      </select>
      <input type="text" class="link-edit-username" data-index="${newItem.dataset.index}" value="${username}" placeholder="username">
      <button type="button" class="link-edit-remove" data-index="${newItem.dataset.index}">×</button>
    `
    editList.appendChild(newItem)
    addUsername.value = ''
  })

  // Remove link (event delegation)
  editList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('link-edit-remove')) {
      const item = target.closest('.link-edit-item')
      item?.remove()
    }
  })

  // Save links
  saveBtn?.addEventListener('click', async () => {
    const items = editList.querySelectorAll('.link-edit-item')
    const links: { service: string; username: string }[] = []

    items.forEach(item => {
      const service = (item.querySelector('.link-edit-service') as HTMLSelectElement)?.value
      const username = (item.querySelector('.link-edit-username') as HTMLInputElement)?.value.trim()
      if (service && username) {
        links.push({ service, username })
      }
    })

    // Also include pending add form input (if user forgot to click +)
    if (addService && addUsername) {
      const pendingUsername = addUsername.value.trim()
      if (pendingUsername) {
        links.push({ service: addService.value, username: pendingUsername })
      }
    }

    try {
      saveBtn.textContent = 'Saving...'
      ;(saveBtn as HTMLButtonElement).disabled = true

      await updateLinks(links)

      if (statusEl) statusEl.innerHTML = '<span class="link-edit-success">Saved!</span>'

      // Refresh page
      setTimeout(() => {
        render(parseRoute())
      }, 1000)
    } catch (err) {
      console.error('Update failed:', err)
      if (statusEl) statusEl.innerHTML = `<span class="link-edit-error">Error: ${err}</span>`
      saveBtn.textContent = 'Save'
      ;(saveBtn as HTMLButtonElement).disabled = false
    }
  })
}

// Initial render
render(parseRoute())

// Handle route changes
onRouteChange(render)
