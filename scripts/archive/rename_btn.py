import sys

def main():
    with open('src/components/InventoryView.tsx', 'r') as f:
        content = f.read()

    target = """<Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nhập máy IMEI</span>"""
    
    replacement = """<Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nhập máy / IMEI</span>"""
            
    content = content.replace(target, replacement)
    
    with open('src/components/InventoryView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
