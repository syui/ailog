// Config types
export interface BotConfig {
  did: string
  handle: string
}

export interface AppConfig {
  title: string
  did?: string
  handle: string
  bot?: BotConfig
  collection: string
  chatCollection?: string
  cardCollection?: string
  network: string
  color: string
  siteUrl: string
  repoUrl?: string
  oauth?: boolean
}

export interface Networks {
  [domain: string]: {
    plc: string
    bsky: string
    web: string
    handleDomains?: string[]
  }
}

// ATProto types
export interface DescribeRepo {
  did: string
  handle: string
  collections: string[]
}

export interface Profile {
  cid: string
  uri: string
  value: {
    $type: string
    avatar?: {
      $type: string
      mimeType: string
      ref: { $link: string }
      size: number
    }
    displayName?: string
    description?: string
    createdAt?: string
  }
}

export interface Post {
  cid: string
  uri: string
  value: {
    $type: string
    title: string
    content: string
    createdAt: string
    lang?: string
    translations?: {
      [lang: string]: {
        title: string
        content: string
      }
    }
  }
}

export interface ListRecordsResponse<T> {
  records: T[]
  cursor?: string
}

export interface ChatMessage {
  cid: string
  uri: string
  value: {
    $type: string
    content: string
    author: string
    createdAt: string
    root?: string
    parent?: string
    lang?: string
    translations?: {
      [lang: string]: {
        content: string
      }
    }
  }
}

// Card types
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
