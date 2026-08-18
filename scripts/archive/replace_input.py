import sys

def main():
    with open('src/components/POSSalesView.tsx', 'r') as f:
        content = f.read()

    target = """              <input
                type="text"
                placeholder="Tên máy thu cũ (Ví dụ: iPhone 14 Pro 128GB VN/A)"
                value={tradeInModel}
                onChange={(e) => setTradeInModel(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 mb-1.5 font-medium"
              />
              <input
                type="number"
                placeholder="Số tiền định giá thu vào (VNĐ)"
                value={tradeInDiscount || ''}
                onChange={(e) => setTradeInDiscount(Number(e.target.value))}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
              />"""
              
    replacement = """              <input
                type="text"
                placeholder="Tên máy thu cũ (Ví dụ: iPhone 14 Pro 128GB VN/A)"
                value={tradeInModel}
                onChange={(e) => setTradeInModel(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 mb-1.5 font-medium"
              />
              <input
                type="text"
                placeholder="Nhập số IMEI (Bắt buộc để nhập kho)"
                value={tradeInImei}
                onChange={(e) => setTradeInImei(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 mb-1.5 font-mono"
              />
              <input
                type="number"
                placeholder="Số tiền định giá thu vào (VNĐ)"
                value={tradeInDiscount || ''}
                onChange={(e) => setTradeInDiscount(Number(e.target.value))}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
              />"""

    content = content.replace(target, replacement)
    
    with open('src/components/POSSalesView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
