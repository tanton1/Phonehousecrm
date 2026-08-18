import re

with open('src/types.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_types = """
export type CatalogCategory = 'DEVICE' | 'PART' | 'ACCESSORY';

export interface MasterCatalogItem {
  id: string;
  sku: string;
  name: string;
  category: CatalogCategory;
  // Specifications
  model?: string;
  storage?: string;
  color?: string;
  condition?: string;
  region?: string;
  compatibleModels?: string[]; // For parts/accessories
  // Default Pricing
  defaultImportPrice: number;
  defaultRetailPrice: number;
  minStockLevel?: number;
  notes?: string;
}

"""

# Insert before ProductItem
content = content.replace("export interface ProductItem {", new_types + "export interface ProductItem {")

with open('src/types.ts', 'w', encoding='utf-8') as f:
    f.write(content)
