import type { LinkCollection, LinkItem } from '../lib/api'

// Service configurations
const serviceConfig = {
  github: {
    name: 'GitHub',
    urlTemplate: 'https://github.com/{username}',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
  },
  x: {
    name: 'X',
    urlTemplate: 'https://x.com/{username}',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  },
  youtube: {
    name: 'YouTube',
    urlTemplate: 'https://youtube.com/@{username}',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  },
}

// Available services for dropdown
export const availableServices = ['github', 'x', 'youtube'] as const

// Build URL from service and username
function buildUrl(service: string, username: string): string {
  const config = serviceConfig[service as keyof typeof serviceConfig]
  if (!config) return '#'
  return config.urlTemplate.replace('{username}', username)
}

// Render link item for display
function renderLinkItem(link: LinkItem): string {
  const { service, username } = link
  const config = serviceConfig[service as keyof typeof serviceConfig]
  if (!config) return ''

  const url = buildUrl(service, username)

  return `
    <a href="${url}" class="link-item link-${service}" target="_blank" rel="noopener noreferrer">
      <div class="link-icon">${config.icon}</div>
      <div class="link-info">
        <span class="link-service">${config.name}</span>
        <span class="link-username">@${username}</span>
      </div>
    </a>
  `
}

// Render edit form for a link
function renderLinkEditItem(link: LinkItem, index: number): string {
  const serviceOptions = availableServices.map(s =>
    `<option value="${s}" ${s === link.service ? 'selected' : ''}>${serviceConfig[s].name}</option>`
  ).join('')

  return `
    <div class="link-edit-item" data-index="${index}">
      <select class="link-edit-service" data-index="${index}">
        ${serviceOptions}
      </select>
      <input type="text" class="link-edit-username" data-index="${index}" value="${link.username}" placeholder="username">
      <button type="button" class="link-edit-remove" data-index="${index}">×</button>
    </div>
  `
}

// Render link page
export function renderLinkPage(data: LinkCollection | null, handle: string, isOwner = false): string {
  const jsonUrl = `/@${handle}/at/collection/ai.syui.at.link/self`
  const links = data?.links || []
  const editBtn = isOwner ? `<button id="link-edit-btn" class="edit-btn">edit</button>` : ''

  // Edit form (hidden by default)
  const editItems = links.map((link, i) => renderLinkEditItem(link, i)).join('')
  const newServiceOptions = availableServices.map(s =>
    `<option value="${s}">${serviceConfig[s].name}</option>`
  ).join('')

  const editForm = isOwner ? `
    <div id="link-edit-form" class="link-edit-form" style="display: none;">
      <div id="link-edit-list">${editItems}</div>
      <div class="link-edit-add">
        <select id="link-add-service">
          ${newServiceOptions}
        </select>
        <input type="text" id="link-add-username" placeholder="username">
        <button type="button" id="link-add-btn">+</button>
      </div>
      <div class="link-edit-actions">
        <button type="button" id="link-edit-cancel">Cancel</button>
        <button type="button" id="link-edit-save">Save</button>
      </div>
      <div id="link-edit-status"></div>
    </div>
  ` : ''

  if (links.length === 0) {
    return `
      <div class="link-container">
        <div class="link-header">
          <h2>Links</h2>
          <div class="link-header-actions">
            <a href="${jsonUrl}" class="json-btn">json</a>
            ${editBtn}
          </div>
        </div>
        ${editForm}
        <p class="link-empty" id="link-display">No links found.</p>
      </div>
    `
  }

  const items = links.map(link => renderLinkItem(link)).join('')

  return `
    <div class="link-container">
      <div class="link-header">
        <h2>Links</h2>
        <div class="link-header-actions">
          <a href="${jsonUrl}" class="json-btn">json</a>
          ${editBtn}
        </div>
      </div>
      ${editForm}
      <div class="link-grid" id="link-display">${items}</div>
    </div>
  `
}
