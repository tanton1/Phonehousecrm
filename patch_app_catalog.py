import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
imports = """
import { MasterCatalogView } from './components/MasterCatalogView';
import { INITIAL_CATALOG_ITEMS } from './data/catalogData';
import { MasterCatalogItem } from './types';
"""

content = content.replace("import { ProductsView }", imports + "import { ProductsView }")

# Add state
state_code = """
  const [catalogItems, setCatalogItems] = useState<MasterCatalogItem[]>(INITIAL_CATALOG_ITEMS);
"""
content = content.replace("const [products, setProducts] = useState", state_code + "\n  const [products, setProducts] = useState")

# Add render block
render_block = """
        {activeTab === 'master-catalog' && (
          <MasterCatalogView 
            items={catalogItems}
            onAddItem={(item) => setCatalogItems([...catalogItems, item])}
            onUpdateItem={(item) => setCatalogItems(catalogItems.map(i => i.id === item.id ? item : i))}
            onDeleteItem={(id) => setCatalogItems(catalogItems.filter(i => i.id !== id))}
          />
        )}
"""

content = content.replace("{activeTab === 'products' && (", render_block + "\n        {activeTab === 'products' && (")

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

