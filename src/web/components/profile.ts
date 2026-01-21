import type { Profile } from '../types'
import { getAvatarUrl, getAvatarUrlRemote } from '../lib/api'

// Service definitions for profile icons
export interface ServiceLink {
  name: string
  icon: string
  url: string
  collection: string
}

// Get available services based on user's collections
export function getServiceLinks(handle: string, collections: string[]): ServiceLink[] {
  const services: ServiceLink[] = []

  if (collections.includes('ai.syui.card.user')) {
    services.push({
      name: 'Card',
      icon: '/service/ai.syui.card.png',
      url: `/@${handle}/at/card`,
      collection: 'ai.syui.card.user'
    })
  }

  // Card (old) - show if user has ai.syui.card.old collection
  if (collections.includes('ai.syui.card.old')) {
    services.push({
      name: 'Card (old)',
      icon: '/service/ai.syui.card.old.png',
      url: `/@${handle}/at/card-old`,
      collection: 'ai.syui.card.old'
    })
  }

  // RSE
  if (collections.includes('ai.syui.rse.user')) {
    services.push({
      name: 'RSE',
      icon: '/service/ai.syui.rse.png',
      url: `/@${handle}/at/rse`,
      collection: 'ai.syui.rse.user'
    })
  }

  return services
}

export async function renderProfile(
  did: string,
  profile: Profile,
  handle: string,
  webUrl?: string,
  localOnly = false,
  collections: string[] = []
): Promise<string> {
  // Local mode: sync, no API call. Remote mode: async with API call
  const avatarUrl = localOnly
    ? getAvatarUrl(did, profile, true)
    : await getAvatarUrlRemote(did, profile)
  const displayName = profile.value.displayName || handle || 'Unknown'
  const description = profile.value.description || ''

  // Build profile link (e.g., https://bsky.app/profile/did:plc:xxx)
  const profileLink = webUrl ? `${webUrl}/profile/${did}` : null

  const handleHtml = profileLink
    ? `<a href="${profileLink}" class="profile-handle-link" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`
    : `<span>@${escapeHtml(handle)}</span>`

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="${escapeHtml(displayName)}" class="profile-avatar">`
    : `<div class="profile-avatar-placeholder"></div>`

  // Service icons (show for users with matching collections)
  let serviceIconsHtml = ''
  if (collections.length > 0) {
    const services = getServiceLinks(handle, collections)
    if (services.length > 0) {
      const iconsHtml = services.map(s => `
        <a href="${s.url}" class="service-icon-link" title="${s.name}">
          <img src="${s.icon}" alt="${s.name}" class="service-icon" />
        </a>
      `).join('')
      serviceIconsHtml = `<div class="service-icons">${iconsHtml}</div>`
    }
  }

  return `
    <div class="profile">
      ${avatarHtml}
      <div class="profile-info">
        <h1 class="profile-name">${escapeHtml(displayName)}</h1>
        <p class="profile-handle">${handleHtml}</p>
        ${description ? `<p class="profile-desc">${escapeHtml(description)}</p>` : ''}
      </div>
      ${serviceIconsHtml}
    </div>
  `
}

export function mountProfile(container: HTMLElement, html: string): void {
  container.innerHTML = html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
