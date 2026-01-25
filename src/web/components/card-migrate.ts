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

// Perform migration
export async function performMigration(user: OldApiUser, cards: OldApiCard[]): Promise<boolean> {
  const checksum = generateChecksum(user, cards)

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

  // Merge cards by card number (sum cp, keep highest status)
  const cardGroups = new Map<number, {
    card: number
    firstId: number  // First api.syui.ai card id
    totalCp: number
    bestStatus: string
  }>()

  for (const c of cards) {
    const existing = cardGroups.get(c.card)
    if (existing) {
      existing.totalCp += c.cp
      // Keep highest status
      if (statusToRare(c.status) > statusToRare(existing.bestStatus)) {
        existing.bestStatus = c.status || 'normal'
      }
    } else {
      cardGroups.set(c.card, {
        card: c.card,
        firstId: c.id,
        totalCp: c.cp,
        bestStatus: c.status || 'normal',
      })
    }
  }

  // Convert merged data to card array
  const cardData = Array.from(cardGroups.values())
    .sort((a, b) => a.card - b.card)
    .map(g => ({
      cid: String(g.firstId),  // Original api.syui.ai card id (string)
      id: g.card,              // Card number
      cp: g.totalCp,
      rare: statusToRare(g.bestStatus),
      unique: g.bestStatus === 'super',
    }))

  const result = await saveMigratedCardData(userData, cardData, checksum)
  return result !== null
}

// Convert status to rare value
function statusToRare(status: string): number {
  switch (status) {
    case 'super': return 1
    case 'first': return 5
    case 'second': return 4
    case 'third': return 3
    case 'fourth': return 2
    case 'fifth': return 1
    default: return 0  // normal and others
  }
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

  // Card grid - merge by card number (same as migration logic)
  const cardGroups = new Map<number, { card: number, totalCp: number, rare: number, isUnique: boolean }>()
  for (const c of oldApiCards) {
    const existing = cardGroups.get(c.card)
    const rare = statusToRare(c.status)
    const isUnique = c.status === 'super'
    if (existing) {
      existing.totalCp += c.cp
      if (rare > existing.rare) existing.rare = rare
      if (isUnique) existing.isUnique = true
    } else {
      cardGroups.set(c.card, { card: c.card, totalCp: c.cp, rare, isUnique })
    }
  }

  const sortedGroups = Array.from(cardGroups.values())
    .sort((a, b) => a.card - b.card)

  const cardsHtml = sortedGroups.map(({ card, totalCp, rare, isUnique }) => {
    const rarityClass = isUnique ? 'unique' : rare >= 1 ? 'rare' : ''
    const effectsHtml = rarityClass ? `
      <div class="card-status pattern-${rarityClass}"></div>
      <div class="card-status color-${rarityClass}"></div>
    ` : ''

    return `
      <div class="card-item">
        <div class="card-wrapper">
          <div class="card-reflection">
            <img src="/card/${card}.webp" alt="Card ${card}" loading="lazy" />
          </div>
          ${effectsHtml}
        </div>
        <div class="card-detail">
          <span class="card-cp">${totalCp}</span>
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

    // Count unique card types
    const uniqueCards = new Set(oldApiCards.map(c => c.card)).size
    if (!confirm(`Migrate ${oldApiCards.length} cards (merged to ${uniqueCards} types) to ATProto?`)) {
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
