// Shapes the category screens share: a category as the page sends it, and the draft the editor works on.

/** Text of a category in one language. */
export interface CategoryText {
  name: string;
  slug: string;
  description: string;
}

/** One category as the page sends it. */
export interface CategoryItem {
  id: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
  translations: { es?: CategoryText; en?: CategoryText };
}

/** The category being edited; a null id means a new one. */
export interface CategoryDraft {
  id: string | null;
  parentId: string | null;
  isActive: boolean;
  translations: { es: CategoryText; en: CategoryText };
}

/** Text of a language that has no name yet. */
export const EMPTY_TEXT: CategoryText = { name: '', slug: '', description: '' };
