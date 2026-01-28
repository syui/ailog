// RSE display component for ai.syui.rse.user collection
import { renderCard, type UserCard, type CardAdminEntry, type CardAdminData } from './card'

export interface RseAdminItem {
  id: number
  name: string
  text: { ja: string; en: string }
}

export interface RseAdminData {
  item: RseAdminItem[]
}

export interface RseItem {
  id: number
  cp: number
  mode: number
  unique: boolean
}

export interface RseCollection {
  item: RseItem[]
  character: RseItem[]
  createdAt: string
  updatedAt: string
}

// Get current language
function getLang(): string {
  return localStorage.getItem('preferredLang') || 'ja'
}

// Get localized text
function getLocalizedText(obj: { ja: string; en: string } | undefined): string {
  if (!obj) return ''
  const lang = getLang()
  return obj[lang as 'ja' | 'en'] || obj.ja || obj.en || ''
}

// Get rarity class from unique flag
function getRarityClass(item: RseItem): string {
  if (item.unique) return 'unique'
  return ''
}

// Get cards for a character (character 0 = cards 0-99, character 1 = cards 100-199, etc.)
function getCardsForCharacter(
  characterId: number,
  userCards: UserCard[],
  adminData: CardAdminData | null
): { card: UserCard; adminEntry?: CardAdminEntry }[] {
  const minId = characterId * 100
  const maxId = minId + 99

  // Build admin lookup map
  const adminMap = new Map<number, CardAdminEntry>()
  if (adminData?.card) {
    for (const entry of adminData.card) {
      adminMap.set(entry.id, entry)
    }
  }

  // Filter and dedupe cards for this character
  const cardGroups = new Map<number, UserCard>()
  for (const card of userCards) {
    if (card.id >= minId && card.id <= maxId) {
      const existing = cardGroups.get(card.id)
      if (!existing || card.cp > existing.cp || card.unique) {
        cardGroups.set(card.id, card)
      }
    }
  }

  // Sort by ID and add admin entries
  return Array.from(cardGroups.values())
    .sort((a, b) => a.id - b.id)
    .map(card => ({
      card,
      adminEntry: adminMap.get(card.id)
    }))
}

// Render character section with its cards below
function renderCharacterSection(
  item: RseItem,
  userCards: UserCard[],
  adminData: CardAdminData | null
): string {
  const rarityClass = getRarityClass(item)
  const effectsHtml = rarityClass ? `
    <div class="card-status pattern-${rarityClass}"></div>
    <div class="card-status color-${rarityClass}"></div>
  ` : ''

  // Get cards for this character
  const characterCards = getCardsForCharacter(item.id, userCards, adminData)
  const cardsHtml = characterCards.map(({ card, adminEntry }) =>
    renderCard(card, '/card', undefined, adminEntry)
  ).join('')

  return `
    <div class="rse-character-section">
      <div class="rse-character-main">
        <div class="card-item">
          <div class="card-wrapper">
            <div class="card-reflection">
              <img src="/rse/character/${item.id}.webp" alt="character ${item.id}" loading="lazy" />
            </div>
            ${effectsHtml}
          </div>
          <div class="card-detail">
            <span class="card-cp">${item.cp}</span>
          </div>
        </div>
      </div>
      ${characterCards.length > 0 ? `
        <div class="rse-card-grid">${cardsHtml}</div>
      ` : ''}
    </div>
  `
}

// Render single item
function renderRseItem(item: RseItem, rseAdminData: RseAdminData | null): string {
  const rarityClass = getRarityClass(item)
  const effectsHtml = rarityClass ? `
    <div class="card-status pattern-${rarityClass}"></div>
    <div class="card-status color-${rarityClass}"></div>
  ` : ''

  // Get admin entry for this item
  const adminEntry = rseAdminData?.item?.find(i => i.id === item.id)
  const name = adminEntry?.name || ''
  const text = adminEntry ? getLocalizedText(adminEntry.text) : ''

  const infoHtml = (name || text) ? `
    <div class="card-info">
      <div class="card-info-header">
        <span class="card-info-name">${name}</span>
      </div>
      ${text ? `<div class="card-info-text">${text}</div>` : ''}
    </div>
  ` : ''

  return `
    <div class="card-item">
      <div class="card-wrapper">
        <div class="card-reflection">
          <img src="/rse/item/${item.id}.webp" alt="item ${item.id}" loading="lazy" />
        </div>
        ${effectsHtml}
      </div>
      <div class="card-detail">
        <span class="card-cp">${item.cp}</span>
      </div>
      ${infoHtml}
    </div>
  `
}

// Render RSE page
export function renderRsePage(
  collection: RseCollection | null,
  handle: string,
  userCards: UserCard[] = [],
  adminData: CardAdminData | null = null,
  rseAdminData: RseAdminData | null = null
): string {
  const jsonUrl = `/@${handle}/at/collection/ai.syui.rse.user/self`

  if (!collection) {
    return `
      <div class="card-page">
        <div class="card-header">
          <h2>RSE</h2>
          <a href="${jsonUrl}" class="json-btn">json</a>
        </div>
        <p class="no-cards">No RSE data found for @${handle}</p>
      </div>
    `
  }

  const characters = collection.character || []
  const items = collection.item || []

  // Stats
  const totalChars = characters.length
  const totalItems = items.length
  const uniqueChars = characters.filter(c => c.unique).length

  // Sort by id
  const sortedChars = [...characters].sort((a, b) => a.id - b.id)
  const sortedItems = [...items].sort((a, b) => a.id - b.id)

  const charsHtml = sortedChars.map(c =>
    renderCharacterSection(c, userCards, adminData)
  ).join('')
  const itemsHtml = sortedItems.map(i => renderRseItem(i, rseAdminData)).join('')

  return `
    <div class="card-page">
      <div class="card-header">
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">${totalChars}</span>
            <span class="stat-label">Characters</span>
          </div>
          <div class="stat">
            <span class="stat-value">${totalItems}</span>
            <span class="stat-label">Items</span>
          </div>
          <div class="stat rare-unique">
            <span class="stat-value">${uniqueChars}</span>
            <span class="stat-label">Unique</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <a href="${jsonUrl}" class="json-btn">json</a>
      </div>
      ${charsHtml ? `
        <h3 class="rse-section-title">Characters</h3>
        <div class="rse-characters">${charsHtml}</div>
      ` : ''}
      ${itemsHtml ? `
        <h3 class="rse-section-title">Items</h3>
        <div class="card-grid">${itemsHtml}</div>
      ` : ''}
    </div>
  `
}
