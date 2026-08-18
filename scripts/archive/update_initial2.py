import sys

def main():
    with open('src/data/initialData.ts', 'r') as f:
        content = f.read()

    target = """  printFooterNote: 'Bảo hành 1 đổi 1 trong 30 ngày đầu • Bảo hành nguồn & màn hình theo cam kết.',
  defaultWarrantyMonths: 12,
  branches: INITIAL_BRANCHES,"""
    
    replacement = """  printFooterNote: 'Bảo hành 1 đổi 1 trong 30 ngày đầu • Bảo hành nguồn & màn hình theo cam kết.',
  defaultWarrantyMonths: 12,
  warrantyPackages: [
    { name: 'Gói VIP: 12 tháng (Bao nguồn + Màn hình + FaceID)', price: 0 },
    { name: 'Gói Kim Cương: 24 tháng (Rơi Vỡ + Vào Nước)', price: 1500000 },
    { name: 'Bảo hành tiêu chuẩn 6 tháng phần cứng', price: 0 },
    { name: 'Gói mở rộng 12 tháng (Lỗi 1 đổi 1)', price: 2000000 }
  ],
  branches: INITIAL_BRANCHES,"""
            
    content = content.replace(target, replacement)
    
    with open('src/data/initialData.ts', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
