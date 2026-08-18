import sys

def main():
    with open('src/components/POSSalesView.tsx', 'r') as f:
        content = f.read()

    target = "  const [warrantyPackage, setWarrantyPackage] = useState('Gói VIP: 12 tháng (Bao nguồn + Màn hình)');"
    replacement = """  const [warrantyPackage, setWarrantyPackage] = useState(() => storeSettings?.warrantyPackages?.[0]?.name || 'Bảo hành tiêu chuẩn 6 tháng');
  
  React.useEffect(() => {
    if (storeSettings?.warrantyPackages && storeSettings.warrantyPackages.length > 0) {
      if (!storeSettings.warrantyPackages.find(p => p.name === warrantyPackage)) {
        setWarrantyPackage(storeSettings.warrantyPackages[0].name);
        setWarrantyPrice(storeSettings.warrantyPackages[0].price);
      }
    }
  }, [storeSettings, warrantyPackage]);"""
            
    content = content.replace(target, replacement)
    
    with open('src/components/POSSalesView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
