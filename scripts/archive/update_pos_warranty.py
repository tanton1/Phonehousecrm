import sys

def main():
    with open('src/components/POSSalesView.tsx', 'r') as f:
        content = f.read()

    # We need to change the warranty options rendering
    target = """              <select
                value={warrantyPackage}
                onChange={(e) => setWarrantyPackage(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
              >
                <option value="Gói VIP: 12 tháng (Bao nguồn + Màn hình)">
                  Gói VIP: 12 tháng (Bao nguồn + Màn hình + FaceID) [Miễn Phí]
                </option>
                <option value="Gói Kim Cương: 24 tháng (Rơi Vỡ + Vào Nước)">
                  Gói Kim Cương: 24 tháng (Bao Rơi Vỡ / Vào Nước)
                </option>
                <option value="Bảo hành tiêu chuẩn 6 tháng phần cứng">
                  Bảo hành tiêu chuẩn 6 tháng phần cứng
                </option>
              </select>"""
    
    replacement = """              <select
                value={warrantyPackage}
                onChange={(e) => {
                  setWarrantyPackage(e.target.value);
                  const pkg = storeSettings?.warrantyPackages?.find(p => p.name === e.target.value);
                  if (pkg) setWarrantyPrice(pkg.price);
                }}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
              >
                {storeSettings?.warrantyPackages?.map((pkg, idx) => (
                  <option key={idx} value={pkg.name}>
                    {pkg.name} {pkg.price > 0 ? `[+${pkg.price.toLocaleString('vi-VN')}đ]` : '[Miễn Phí]'}
                  </option>
                ))}
              </select>"""
            
    content = content.replace(target, replacement)
    
    with open('src/components/POSSalesView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
