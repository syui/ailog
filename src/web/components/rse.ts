// RSE display component for ai.syui.rse.user collection

export interface RseItem {
  id: number
  cp: number
  mode: number
  shiny: boolean
  unique: boolean
}

export interface RseCollection {
  item: RseItem[]
  character: RseItem[]
  createdAt: string
  updatedAt: string
}

// Get rarity class from shiny/unique flags
function getRarityClass(item: RseItem): string {
  if (item.unique) return 'unique'
  if (item.shiny) return 'shiny'
  return ''
}

// Render single item/character
function renderRseItem(item: RseItem, type: 'item' | 'character'): string {
  const rarityClass = getRarityClass(item)
  const effectsHtml = rarityClass ? `
    <div class="card-status pattern-${rarityClass}"></div>
    <div class="card-status color-${rarityClass}"></div>
  ` : ''

  return `
    <div class="card-item">
      <div class="card-wrapper">
        <div class="card-reflection">
          <img src="/rse/${type}/${item.id}.webp" alt="${type} ${item.id}" loading="lazy" />
        </div>
        ${effectsHtml}
      </div>
      <div class="card-detail">
        <span class="card-cp">${item.cp}</span>
      </div>
    </div>
  `
}

// Render RSE page
export function renderRsePage(
  collection: RseCollection | null,
  handle: string
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
  const shinyChars = characters.filter(c => c.shiny).length

  // Sort by unique > shiny > id
  const sortedChars = [...characters].sort((a, b) => {
    if (a.unique !== b.unique) return a.unique ? -1 : 1
    if (a.shiny !== b.shiny) return a.shiny ? -1 : 1
    return a.id - b.id
  })

  const sortedItems = [...items].sort((a, b) => {
    if (a.unique !== b.unique) return a.unique ? -1 : 1
    if (a.shiny !== b.shiny) return a.shiny ? -1 : 1
    return a.id - b.id
  })

  const charsHtml = sortedChars.map(c => renderRseItem(c, 'character')).join('')
  const itemsHtml = sortedItems.map(i => renderRseItem(i, 'item')).join('')

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
          <div class="stat rare-shiny">
            <span class="stat-value">${shinyChars}</span>
            <span class="stat-label">Shiny</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <a href="${jsonUrl}" class="json-btn">json</a>
      </div>
      ${charsHtml ? `
        <h3 class="rse-section-title">Characters</h3>
        <div class="card-grid">${charsHtml}</div>
      ` : ''}
      ${itemsHtml ? `
        <h3 class="rse-section-title">Items</h3>
        <div class="card-grid">${itemsHtml}</div>
      ` : ''}
    </div>
  `
}
