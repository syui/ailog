// Card migration component - migrate from api.syui.ai to ATProto

import { getOldApiUserByDid, getOldApiCards, getCardOldRecordKey, generateChecksum, type OldApiUser, type OldApiCard } from '../lib/api'
import { saveMigratedCardData, isLoggedIn, getLoggedInDid } from '../lib/auth'

export interface MigrationState {
  loading: boolean
  oldApiUser: OldApiUser | null
  oldApiCards: OldApiCard[]
  hasMigrated: boolean
  migratedRkey: string | null
  error: string | null
}

// Check migration status for a user
export async function checkMigrationStatus(did: string): Promise<MigrationState> {
  const state: MigrationState = {
    loading: true,
    oldApiUser: null,
    oldApiCards: [],
    hasMigrated: false,
    migratedRkey: null,
    error: null
  }

  try {
    // Check if already migrated
    state.migratedRkey = await getCardOldRecordKey(did)
    state.hasMigrated = state.migratedRkey !== null

    // Check if user exists in api.syui.ai
    state.oldApiUser = await getOldApiUserByDid(did)

    if (state.oldApiUser) {
      // Load cards
      state.oldApiCards = await getOldApiCards(state.oldApiUser.id)
    }
  } catch (err) {
    state.error = String(err)
  }

  state.loading = false
  return state
}

// Convert datetime to ISO UTC format
function toUtcDatetime(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

// Maximum cards to migrate (ATProto record size limit ~256KB)
const MAX_MIGRATE_CARDS = 1200

// Perform migration
export async function performMigration(user: OldApiUser, cards: OldApiCard[]): Promise<boolean> {
  // Limit cards to avoid exceeding ATProto record size limit
  const limitedCards = cards.slice(0, MAX_MIGRATE_CARDS)
  const checksum = generateChecksum(user, limitedCards)

  // Convert user data (only required + used fields, matching lexicon types)
  // Note: ATProto doesn't support float, so planet is converted to integer
  const userData = {
    username: user.username,
    did: user.did,
    aiten: Math.floor(user.aiten),
    fav: Math.floor(user.fav),
    coin: Math.floor(user.coin),
    planet: Math.floor(user.planet),
    createdAt: toUtcDatetime(user.created_at),
    updatedAt: toUtcDatetime(user.updated_at),
  }

  // Convert card data (only required + used fields)
  const cardData = limitedCards.map(c => ({
    id: c.id,
    card: c.card,
    cp: c.cp,
    status: c.status || 'normal',
    skill: c.skill || 'normal',
    createdAt: toUtcDatetime(c.created_at),
  }))

  const result = await saveMigratedCardData(userData, cardData, checksum)
  return result !== null
}

// Render migration icon for profile (shown when user has api.syui.ai account)
export function renderMigrationIcon(handle: string, hasOldApi: boolean, hasMigrated: boolean): string {
  if (!hasOldApi) return ''

  const icon = hasMigrated ? '/service/ai.syui.card.png' : '/service/ai.syui.card.old.png'
  const title = hasMigrated ? 'Card (Migrated)' : 'Card Migration Available'

  return `
    <a href="/@${handle}/at/card-old" class="service-icon-link" title="${title}">
      <img src="${icon}" alt="Card Migration" class="service-icon ${hasMigrated ? '' : 'migration-available'}" />
    </a>
  `
}

// Convert status to rarity
function statusToRare(status: string): number {
  switch (status) {
    case 'super': return 3  // unique
    case 'shiny': return 2  // shiny (assumed from skill or special status)
    case 'first': return 1  // rare
    default: return 0       // normal
  }
}

// Render migration page (simplified)
export function renderMigrationPage(
  state: MigrationState,
  handle: string,
  isOwner: boolean
): string {
  const { oldApiUser, oldApiCards, hasMigrated, migratedRkey, error } = state
  const jsonUrl = migratedRkey
    ? `/@${handle}/at/collection/ai.syui.card.old/${migratedRkey}`
    : `/@${handle}/at/collection/ai.syui.card.old`

  if (error) {
    return `
      <div class="card-migrate-page">
        <div class="error">Error: ${error}</div>
      </div>
    `
  }

  if (!oldApiUser) {
    return `
      <div class="card-migrate-page">
        <p class="no-data">No api.syui.ai account found</p>
      </div>
    `
  }

  // Button or migrated status
  let buttonHtml = ''
  if (hasMigrated) {
    buttonHtml = `<span class="migrated-badge">✓ migrated</span>`
  } else if (isOwner && isLoggedIn()) {
    buttonHtml = `<button id="migrate-btn" class="migrate-btn">Migrate</button>`
  }

  // Card grid (same style as /card page)
  const cardGroups = new Map<number, { card: OldApiCard, count: number, maxCp: number, rare: number }>()
  for (const card of oldApiCards) {
    const existing = cardGroups.get(card.card)
    const rare = statusToRare(card.status)
    if (existing) {
      existing.count++
      if (card.cp > existing.maxCp) existing.maxCp = card.cp
      if (rare > existing.rare) existing.rare = rare
    } else {
      cardGroups.set(card.card, { card, count: 1, maxCp: card.cp, rare })
    }
  }

  const sortedGroups = Array.from(cardGroups.values())
    .sort((a, b) => a.card.card - b.card.card)

  const cardsHtml = sortedGroups.map(({ card, count, maxCp, rare }) => {
    const rarityClass = rare === 3 ? 'unique' : rare === 2 ? 'shiny' : rare === 1 ? 'rare' : ''
    const effectsHtml = rarityClass ? `
      <div class="card-status pattern-${rarityClass}"></div>
      <div class="card-status color-${rarityClass}"></div>
    ` : ''
    const countBadge = count > 1 ? `<span class="card-count">x${count}</span>` : ''

    return `
      <div class="card-item">
        <div class="card-wrapper">
          <div class="card-reflection">
            <img src="/card/${card.card}.webp" alt="Card ${card.card}" loading="lazy" />
          </div>
          ${effectsHtml}
          ${countBadge}
        </div>
        <div class="card-detail">
          <span class="card-cp">${maxCp}</span>
        </div>
      </div>
    `
  }).join('')

  return `
    <div class="card-page">
      <div class="card-header">
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">${oldApiUser.username}</span>
            <span class="stat-label">User</span>
          </div>
          <div class="stat">
            <span class="stat-value">${oldApiUser.aiten.toLocaleString()}</span>
            <span class="stat-label">Aiten</span>
          </div>
          <div class="stat">
            <span class="stat-value">${Math.floor(oldApiUser.planet).toLocaleString()}</span>
            <span class="stat-label">Planet</span>
          </div>
          <div class="stat">
            <span class="stat-value">${(oldApiUser.coin ?? 0).toLocaleString()}</span>
            <span class="stat-label">Coin</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <a href="${jsonUrl}" class="json-btn">json</a>
        ${buttonHtml}
      </div>
      <div class="card-grid">${cardsHtml}</div>
    </div>
  `
}

// Setup migration button handler
export function setupMigrationButton(
  oldApiUser: OldApiUser,
  oldApiCards: OldApiCard[],
  onSuccess: () => void
): void {
  const btn = document.getElementById('migrate-btn')
  if (!btn) return

  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const loggedInDid = getLoggedInDid()
    if (!loggedInDid || loggedInDid !== oldApiUser.did) {
      alert('DID mismatch. Please login with the correct account.')
      return
    }

    const migrateCount = Math.min(oldApiCards.length, MAX_MIGRATE_CARDS)
    const limitMsg = oldApiCards.length > MAX_MIGRATE_CARDS ? ` (limited from ${oldApiCards.length})` : ''
    if (!confirm(`Migrate ${migrateCount} cards${limitMsg} to ATProto?`)) {
      return
    }

    btn.textContent = 'Migrating...'
    ;(btn as HTMLButtonElement).disabled = true

    try {
      const success = await performMigration(oldApiUser, oldApiCards)
      if (success) {
        alert('Migration successful!')
        onSuccess()
      } else {
        alert('Migration failed.')
      }
    } catch (err) {
      alert('Migration error: ' + err)
    }

    btn.textContent = 'Migrate to ATProto'
    ;(btn as HTMLButtonElement).disabled = false
  })
}
