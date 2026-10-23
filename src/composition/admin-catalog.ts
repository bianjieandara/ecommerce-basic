// Wiring of the admin catalog (products, categories, attributes) and the image library. Kept apart from the container so
// the container stays a list of what exists, not of how each part is built.
import { ManageAttributes } from '@/application/catalog/manage-attributes';
import { ManageCategories } from '@/application/catalog/manage-categories';
import {
  ChangeProductStatus,
  ChangeProductStatuses,
  DuplicateProduct,
} from '@/application/catalog/product-actions';
import { UpsertProduct } from '@/application/catalog/upsert-product';
import type { EvaluateStockChanges } from '@/application/inventory/evaluate-stock-changes';
import { MediaLibrary } from '@/application/media/media-library';
import type { ProductRepository } from '@/application/ports/catalog';
import type {
  AdminCatalogQueries,
  AttributeRepository,
  CategoryRepository,
} from '@/application/ports/catalog-admin';
import type { MediaStorage } from '@/application/ports/media';
import type { Clock, IdGenerator } from '@/application/ports/platform';
import { D1AdminCatalogQueries } from '@/infrastructure/d1/admin-catalog-queries';
import { D1AttributeRepository } from '@/infrastructure/d1/attribute-repository';
import { D1CategoryRepository } from '@/infrastructure/d1/category-repository';
import { D1MediaRepository } from '@/infrastructure/d1/media-repository';
import { D1ProductRepository } from '@/infrastructure/d1/product-repository';

/** The admin catalog services the container exposes. */
export interface CatalogAdmin {
  productList: AdminCatalogQueries;
  products: ProductRepository;
  categories: CategoryRepository;
  attributes: AttributeRepository;
  upsertProduct: UpsertProduct;
  changeProductStatus: ChangeProductStatus;
  changeProductStatuses: ChangeProductStatuses;
  duplicateProduct: DuplicateProduct;
  manageCategories: ManageCategories;
  manageAttributes: ManageAttributes;
}

/** Dependencies shared by the admin catalog wiring. */
export interface CatalogAdminDeps {
  ids: IdGenerator;
  clock: Clock;
  evaluateStock: EvaluateStockChanges;
}

/**
 * Builds the admin catalog services from the Worker environment.
 * @param env Worker bindings (DB is used).
 * @param deps Ids and clock.
 * @returns The wired services.
 */
export function createCatalogAdmin(env: Env, deps: CatalogAdminDeps): CatalogAdmin {
  const products = new D1ProductRepository(env.DB);
  const categories = new D1CategoryRepository(env.DB);
  const attributes = new D1AttributeRepository(env.DB);
  const media = new D1MediaRepository(env.DB);
  return {
    productList: new D1AdminCatalogQueries(env.DB),
    products,
    categories,
    attributes,
    upsertProduct: new UpsertProduct({
      products,
      categories,
      attributes,
      media,
      evaluateStock: deps.evaluateStock,
      ids: deps.ids,
      clock: deps.clock,
    }),
    changeProductStatus: new ChangeProductStatus({ products, clock: deps.clock }),
    changeProductStatuses: new ChangeProductStatuses({ products, clock: deps.clock }),
    duplicateProduct: new DuplicateProduct({
      products,
      evaluateStock: deps.evaluateStock,
      ids: deps.ids,
      clock: deps.clock,
    }),
    manageCategories: new ManageCategories({ categories, media, ids: deps.ids, clock: deps.clock }),
    manageAttributes: new ManageAttributes({ attributes, ids: deps.ids }),
  };
}

/** Dependencies of the media library wiring. */
export interface MediaLibraryDeps {
  ids: IdGenerator;
  clock: Clock;
  storage: MediaStorage;
}

/**
 * Builds the image library from the Worker environment.
 * @param env Worker bindings (DB is used).
 * @param deps Ids, clock and the object storage that holds the bytes.
 * @returns The media library.
 */
export function createMediaLibrary(env: Env, deps: MediaLibraryDeps): MediaLibrary {
  return new MediaLibrary({
    media: new D1MediaRepository(env.DB),
    storage: deps.storage,
    ids: deps.ids,
    clock: deps.clock,
  });
}
