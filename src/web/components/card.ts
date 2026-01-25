// Card display component for ai.syui.card.user collection

export interface UserCard {
  id: number
  cp: number
  rare: number
  cid: string
  unique: boolean
}

export interface CardCollection {
  card: UserCard[]
  createdAt: string
  updatedAt: string
}

// Get rarity class name
function getRarityClass(card: UserCard): string {
  if (card.unique) return 'unique'
  if (card.rare >= 4) return 'shiny'  // first(5), second(4)
  if (card.rare >= 1) return 'rare'   // third(3), fourth(2), fifth(1)
  return ''
}


// Render single card with optional count badge
export function renderCard(card: UserCard, baseUrl: string = '/card', count?: number): string {
  const rarityClass = getRarityClass(card)
  const imageUrl = `${baseUrl}/${card.id}.webp`

  const effectsHtml = rarityClass ? `
    <div class="card-status pattern-${rarityClass}"></div>
    <div class="card-status color-${rarityClass}"></div>
  ` : ''

  const countBadge = count && count > 1 ? `<span class="card-count">x${count}</span>` : ''

  return `
    <div class="card-item">
      <div class="card-wrapper" data-card-id="${card.id}" data-cid="${card.cid}">
        <div class="card-reflection">
          <img src="${imageUrl}" alt="Card ${card.id}" loading="lazy" />
        </div>
        ${effectsHtml}
        ${countBadge}
      </div>
      <div class="card-detail">
        <span class="card-cp">${card.cp}</span>
      </div>
    </div>
  `
}

// Render card grid
export function renderCardGrid(cards: UserCard[], baseUrl?: string): string {
  if (!cards || cards.length === 0) {
    return '<div class="no-cards">No cards found</div>'
  }

  const cardsHtml = cards.map(card => renderCard(card, baseUrl)).join('')

  return `<div class="card-grid">${cardsHtml}</div>`
}

// Render card page with stats
export function renderCardPage(
  collection: CardCollection | null,
  handle: string,
  cardCollection: string = 'ai.syui.card.user'
): string {
  const jsonUrl = `/@${handle}/at/collection/${cardCollection}/self`

  if (!collection || !collection.card || collection.card.length === 0) {
    return `
      <div class="card-page">
        <div class="card-header">
          <h2>Cards</h2>
          <a href="${jsonUrl}" class="json-btn">json</a>
        </div>
        <p class="no-cards">No cards found for @${handle}</p>
      </div>
    `
  }

  const cards = collection.card
  const totalCards = cards.length
  const totalCp = cards.reduce((sum, c) => sum + c.cp, 0)

  // Count by rarity
  const rarityCount = {
    normal: cards.filter(c => !c.unique && c.rare === 0).length,
    rare: cards.filter(c => !c.unique && c.rare >= 1 && c.rare < 4).length,
    shiny: cards.filter(c => !c.unique && c.rare >= 4).length,
    unique: cards.filter(c => c.unique).length,
  }

  // Group cards by id and count
  const cardGroups = new Map<number, { card: UserCard, count: number }>()
  for (const card of cards) {
    const existing = cardGroups.get(card.id)
    if (existing) {
      existing.count++
      // Keep the unique/highest rarity/CP version
      if (card.unique && !existing.card.unique ||
          card.rare > existing.card.rare ||
          card.cp > existing.card.cp) {
        existing.card = card
      }
    } else {
      cardGroups.set(card.id, { card, count: 1 })
    }
  }

  // Sort by unique first, then rarity (desc), then by id
  const sortedGroups = Array.from(cardGroups.values())
    .sort((a, b) => {
      if (a.card.unique !== b.card.unique) return a.card.unique ? -1 : 1
      if (b.card.rare !== a.card.rare) return b.card.rare - a.card.rare
      return a.card.id - b.card.id
    })

  const cardsHtml = sortedGroups.map(({ card, count }) => {
    return renderCard(card, '/card', count)
  }).join('')

  return `
    <div class="card-page">
      <div class="card-header">
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">${totalCards}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat">
            <span class="stat-value">${totalCp}</span>
            <span class="stat-label">CP</span>
          </div>
          <div class="stat rare-unique">
            <span class="stat-value">${rarityCount.unique}</span>
            <span class="stat-label">Unique</span>
          </div>
          <div class="stat rare-shiny">
            <span class="stat-value">${rarityCount.shiny}</span>
            <span class="stat-label">Shiny</span>
          </div>
          <div class="stat rare-rare">
            <span class="stat-value">${rarityCount.rare}</span>
            <span class="stat-label">Rare</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <a href="${jsonUrl}" class="json-btn">json</a>
      </div>
      <div class="card-grid">${cardsHtml}</div>
    </div>
  `
}

// Render service icons (shown in profile for logged-in users)
export function renderServiceIcons(_handle: string, services: { name: string, icon: string, url: string }[]): string {
  const iconsHtml = services.map(s => `
    <a href="${s.url}" class="service-icon-link" title="${s.name}">
      <img src="${s.icon}" alt="${s.name}" class="service-icon" />
    </a>
  `).join('')

  return `<div class="service-icons">${iconsHtml}</div>`
}
