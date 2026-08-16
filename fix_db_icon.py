with open('src/components/PurchaseOrdersView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure Database is imported
import_line = "import { \n  Plus,"
if import_line in content:
    content = content.replace(import_line, "import { \n  Database,\n  Plus,")
elif "Plus," in content:
    content = content.replace("Plus,", "Database, Plus,")

with open('src/components/PurchaseOrdersView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
