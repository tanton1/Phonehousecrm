import fs from 'fs';

let content = fs.readFileSync('src/components/ProductsView.tsx', 'utf8');

content = content.replace(
  /<td className="px-5 py-4">\s*<div className="font-bold text-sm text-zinc-900 group-hover:text-\[#F94A1F\] transition-colors line-clamp-1">\{product.name\}<\/div>\s*\{product.brand && <div className="text-xs text-zinc-500 font-medium mt-0.5">\{product.brand\}<\/div>\}\s*<\/td>/g,
  `<td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="scale-75 origin-left shrink-0">
                          <DeviceImageThumbnail fallbackName={product.name} />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-zinc-900 group-hover:text-[#F94A1F] transition-colors line-clamp-1">{product.name}</div>
                          {product.brand && <div className="text-xs text-zinc-500 font-medium mt-0.5">{product.brand}</div>}
                        </div>
                      </div>
                    </td>`
);

fs.writeFileSync('src/components/ProductsView.tsx', content);
