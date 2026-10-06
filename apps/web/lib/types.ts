export interface Category {
  id: string;
  name: string;
  icon: string | null;
  colour: string | null;
  sort_order: number;
}

export interface Profile {
  country: string;
  tax_pack: string;
  hosting_region: string;
  home_currency: string;
  date_format: string;
  time_zone: string;
}

export interface Me {
  accountId: string;
  region: string;
  profile: Profile | null;
  categories: Category[];
}

export interface EntryRow {
  id: string;
  client_uuid: string;
  created_at: string;
  card_type: "personal" | "company";
  category_id: string | null;
  image_path: string | null;
}

export type CardType = "personal" | "company";
