// VRM display component for ai.syui.vrm collection

export interface VrmItem {
  id: number
  cp: number
  cid: string
}

export interface VrmCollection {
  item: VrmItem[]
  createdAt: string
  updatedAt: string
}

interface VrmTier {
  name: string
  color: string
  bgmUrl: string
}

const VRM_TIERS: Record<number, VrmTier> = {
  1: { name: 'Gold', color: '#FFD700', bgmUrl: 'https://vrm.syui.ai/music/gold.mp3' },
  2: { name: 'Silver', color: '#C0C0C0', bgmUrl: 'https://vrm.syui.ai/music/silver.mp3' },
  3: { name: 'Bronze', color: '#CD7F32', bgmUrl: 'https://vrm.syui.ai/music/bronze.mp3' },
}

function renderCrownSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="vrm-crown" fill="${color}"><path d="M345 151.2C354.2 143.9 360 132.6 360 120C360 97.9 342.1 80 320 80C297.9 80 280 97.9 280 120C280 132.6 285.9 143.9 295 151.2L226.6 258.8C216.6 274.5 195.3 278.4 180.4 267.2L120.9 222.7C125.4 216.3 128 208.4 128 200C128 177.9 110.1 160 88 160C65.9 160 48 177.9 48 200C48 221.8 65.5 239.6 87.2 240L119.8 457.5C124.5 488.8 151.4 512 183.1 512L456.9 512C488.6 512 515.5 488.8 520.2 457.5L552.8 240C574.5 239.6 592 221.8 592 200C592 177.9 574.1 160 552 160C529.9 160 512 177.9 512 200C512 208.4 514.6 216.3 519.1 222.7L459.7 267.3C444.8 278.5 423.5 274.6 413.5 258.9L345 151.2z"/></svg>`
}

function renderVrmItem(item: VrmItem): string {
  const tier = VRM_TIERS[item.id] || VRM_TIERS[3]
  const audioId = `vrm-audio-${item.id}-${item.cid}`
  const filename = tier.bgmUrl.split('/').pop()?.replace('.mp3', '') || ''

  return `
    <div class="vrm-item" data-tier="${item.id}">
      <div class="vrm-crown-wrapper">
        ${renderCrownSvg(tier.color)}
      </div>
      <div class="vrm-info">
        <span class="vrm-track-name">${filename}</span>
        <span class="vrm-cp">${item.cp}</span>
      </div>
      <div class="vrm-actions">
        <button class="vrm-play-btn" data-audio-id="${audioId}" data-src="${tier.bgmUrl}" title="play">
          ${playIcon('currentColor')}
        </button>
        <audio id="${audioId}" preload="none"></audio>
      </div>
    </div>
  `
}

export function renderVrmPage(
  collection: VrmCollection | null,
  handle: string
): string {
  const jsonUrl = `/@${handle}/at/collection/ai.syui.vrm/self`

  if (!collection || !collection.item || collection.item.length === 0) {
    return `
      <div class="vrm-page">
        <div class="vrm-header">
          <h2>VRM</h2>
          <a href="${jsonUrl}" class="json-btn">json</a>
        </div>
        <p class="no-cards">No VRM data found for @${handle}</p>
      </div>
    `
  }

  const items = [...collection.item].sort((a, b) => a.id - b.id)
  const totalCp = items.reduce((sum, i) => sum + i.cp, 0)

  const itemsHtml = items.map(item => renderVrmItem(item)).join('')

  return `
    <div class="vrm-page">
      <div class="vrm-header">
        <div class="vrm-stats">
          <div class="stat">
            <span class="stat-value">${items.length}</span>
            <span class="stat-label">Items</span>
          </div>
          <div class="stat">
            <span class="stat-value">${totalCp}</span>
            <span class="stat-label">CP</span>
          </div>
        </div>
      </div>
      <div class="vrm-actions-header">
        <a href="${jsonUrl}" class="json-btn">json</a>
      </div>
      <div class="vrm-list">${itemsHtml}</div>
    </div>
  `
}

const PLAY_SVG_PATH = 'M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320zM252.3 211.1C244.7 215.3 240 223.4 240 232L240 408C240 416.7 244.7 424.7 252.3 428.9C259.9 433.1 269.1 433 276.6 428.4L420.6 340.4C427.7 336 432.1 328.3 432.1 319.9C432.1 311.5 427.7 303.8 420.6 299.4L276.6 211.4C269.2 206.9 259.9 206.7 252.3 210.9z'

function playIcon(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="vrm-play-icon" fill="${fill}"><path d="${PLAY_SVG_PATH}"/></svg>`
}

function getVrmItem(button: HTMLButtonElement): HTMLElement | null {
  return button.closest('.vrm-item')
}

function deactivateItem(btn: HTMLButtonElement): void {
  btn.innerHTML = playIcon('currentColor')
  const item = getVrmItem(btn)
  if (item) item.classList.remove('vrm-active')
}

function activateItem(btn: HTMLButtonElement, color: string): void {
  btn.innerHTML = playIcon(color)
  const item = getVrmItem(btn)
  if (item) {
    item.style.setProperty('--vrm-tier-color', color)
    item.classList.add('vrm-active')
  }
}

export function setupVrmPage(): void {
  let currentAudio: HTMLAudioElement | null = null
  let currentBtn: HTMLButtonElement | null = null

  document.querySelectorAll('.vrm-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const button = btn as HTMLButtonElement
      const audioId = button.dataset.audioId!
      const src = button.dataset.src!
      const audio = document.getElementById(audioId) as HTMLAudioElement
      const item = getVrmItem(button)
      const tier = item?.dataset.tier || '3'
      const tierColors: Record<string, string> = { '1': '#FFD700', '2': '#C0C0C0', '3': '#CD7F32' }
      const color = tierColors[tier] || '#C0C0C0'

      if (currentAudio && currentAudio === audio && !audio.paused) {
        audio.pause()
        audio.currentTime = 0
        deactivateItem(button)
        currentAudio = null
        currentBtn = null
        return
      }

      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
        if (currentBtn) deactivateItem(currentBtn)
      }

      if (!audio.src || audio.src === '') {
        audio.src = src
      }
      audio.play()
      activateItem(button, color)
      currentAudio = audio
      currentBtn = button

      audio.onended = () => {
        deactivateItem(button)
        currentAudio = null
        currentBtn = null
      }
    })
  })
}
