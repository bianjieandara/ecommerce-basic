// Admin catalog ports: categories, attributes and the product list read model. Product writes use ProductRepository.
import type { ProductStatus } from '@/domain/catalog/product';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';

/** Name, slug and description of a category in one language. */
export interface CategoryText {
  name: string;
  slug: string;
  description: string;
}

/** A category as the admin edits it. Parents form a tree; positions order the siblings. */
export interface AdminCategory {
  id: string;
  parentId: string | null;
  imageMediaId: string | null;
  position: number;
  isActive: boolean;
  /** Only the languages that have a name are present. */
  translations: Partial<Record<Locale, CategoryText>>;
}

/** Rows that depend on a category. A category with any of them cannot be deleted. */
export interface CategoryUsage {
  childCount: number;
  productCount: number;
}

/** Category persistence. */
export interface CategoryRepository {
  list(): Promise<AdminCategory[]>;
  findById(id: string): Promise<AdminCategory | null>;
  /** The ids that exist, so callers can reject unknown references. */
  existingIds(ids: string[]): Promise<string[]>;
  usage(id: string): Promise<CategoryUsage>;
  /** Inserts or updates the category and replaces its translations, in one batch. */
  save(category: AdminCategory, nowIso: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Sets each position to the index of its id in the list. */
  reorder(ids: string[], nowIso: string): Promise<void>;
}

/** One value of an attribute, for example "Red" of "Color". */
export interface AdminAttributeValue {
  id: string;
  code: string;
  label: Partial<Record<Locale, string>>;
  colorHex: string | null;
  position: number;
}

/** A variant attribute such as Size or Color. Its values are the choices a variant can use. */
export interface AdminAttribute {
  id: string;
  code: string;
  name: Partial<Record<Locale, string>>;
  display: 'buttons' | 'swatches';
  isFilterable: boolean;
  position: number;
  values: AdminAttributeValue[];
}

/** Attribute persistence. */
export interface AttributeRepository {
  list(): Promise<AdminAttribute[]>;
  findById(id: string): Promise<AdminAttribute | null>;
  /** The ids that exist among the given ones. */
  existingValueIds(ids: string[]): Promise<string[]>;
  /** True when a variant of any product uses one of the attribute's values. */
  attributeInUse(id: string): Promise<boolean>;
  /** True when a variant uses any of the given attribute values (one query for the whole list). */
  anyValueInUse(valueIds: string[]): Promise<boolean>;
  /** Inserts or updates the attribute and its values, and deletes the values that are no longer listed. */
  save(attribute: AdminAttribute): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Filters of the admin product list. */
export interface AdminProductFilter {
  search: string;
  status: ProductStatus | 'all';
  categoryId: string | null;
  onSale: boolean;
  outOfStock: boolean;
  page: number;
  pageSize: number;
}

/** One row of the admin product list. */
export interface AdminProductRow {
  id: string;
  name: string;
  status: ProductStatus;
  basePriceMinor: number;
  isOnSale: boolean;
  isFeatured: boolean;
  stock: number;
  variantCount: number;
  imageMediaId: string | null;
  updatedAt: string;
}

/** Read model of the admin product list. */
export interface AdminCatalogQueries {
  listProducts(filter: AdminProductFilter, locale: Locale): Promise<Paginated<AdminProductRow>>;
}
