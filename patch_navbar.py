import re

with open('src/components/Navbar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Database icon to lucide-react import
if "Database" not in content:
    content = content.replace("PackageCheck,", "PackageCheck, Database,")

# Add master-catalog item
content = content.replace(
    "{ id: 'products', label: 'Linh Phụ Kiện', icon: Package },",
    "{ id: 'master-catalog', label: 'Danh Mục Hàng Hóa', icon: Database },\n    { id: 'products', label: 'Linh Phụ Kiện (Kho Kỹ Thuật)', icon: Package },"
)

with open('src/components/Navbar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

