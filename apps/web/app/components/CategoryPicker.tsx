"use client";

import type { CardType, Category } from "../../lib/types";

interface Props {
  title: string;
  previewUrl: string | null;
  categories: Category[];
  cardType: CardType;
  onCardType: (cardType: CardType) => void;
  onPick: (categoryId: string) => void;
  onCancel: () => void;
}

/** One tap saves: the card switch remembers the last choice, so usually only the category is tapped. */
export function CategoryPicker({ title, previewUrl, categories, cardType, onCardType, onPick, onCancel }: Props) {
  return (
    <div className="screen categorise">
      <div className="categorise-head">
        {previewUrl && <img src={previewUrl} alt="Receipt" className="thumb-lg" />}
        <h2>{title}</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Card">
        {(["personal", "company"] as const).map((type) => (
          <button key={type} role="radio" aria-checked={cardType === type} className={cardType === type ? "on" : ""} onClick={() => onCardType(type)}>
            {type === "personal" ? "Personal card" : "Company card"}
          </button>
        ))}
      </div>
      <div className="category-grid">
        {categories.map((c) => (
          <button key={c.id} className="category" style={{ borderColor: c.colour ?? undefined }} onClick={() => onPick(c.id)}>
            <span className="dot" style={{ background: c.colour ?? "#475569" }} />
            {c.name}
          </button>
        ))}
      </div>
      <button className="link" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
