export enum CardRarity {
  NORMAL = "normal",
  RARE = "rare",
  SUPER_RARE = "super_rare",
  KIRA = "kira",
  UNIQUE = "unique"
}

export interface Card {
  id: number;
  cp: number;
  status: CardRarity;
  skill?: string;
  owner_did: string;
  obtained_at: string;
  is_unique: boolean;
  unique_id?: string;
}

export interface CardDrawResult {
  card: Card;
  is_new: boolean;
  animation_type: string;
}