// The starter category list every new profile gets. Users can rename, reorder and archive them,
// or replace them by snapping their employer's claim form (M2).

export interface DefaultCategory {
  readonly name: string;
  readonly icon: string;
  readonly colour: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Meals", icon: "utensils", colour: "#b45309" },
  { name: "Taxi / ground transport", icon: "car", colour: "#0f766e" },
  { name: "Air travel", icon: "plane", colour: "#1d4ed8" },
  { name: "Accommodation", icon: "bed", colour: "#7c3aed" },
  { name: "Client entertainment", icon: "glass", colour: "#be185d" },
  { name: "Office supplies", icon: "paperclip", colour: "#4d7c0f" },
  { name: "Other", icon: "receipt", colour: "#475569" },
];
