import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Pass catalogItems to PurchaseOrdersView
po_match = re.search(r'<PurchaseOrdersView\s+purchaseOrders=\{filteredPurchaseOrders\}[\s\S]*?/>', content)
if po_match:
    old_po = po_match.group(0)
    new_po = old_po.replace("/>", "  catalogItems={catalogItems}\n          />")
    content = content.replace(old_po, new_po)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

