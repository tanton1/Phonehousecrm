import fs from 'fs';

let content = fs.readFileSync('src/components/ProductsView.tsx', 'utf8');

content = content.replace(
  /<div className="flex-1 min-w-0">\s*<h3 className="font-extrabold text-zinc-900 text-sm tracking-tight line-clamp-2">\s*\{product.name\}\s*<\/h3>\s*<div className="flex items-center gap-2 mt-1">\s*<span className="font-mono text-\[10px\] font-extrabold text-zinc-600 bg-zinc-100 px-1\.5 py-0\.5 rounded-md border border-zinc-200">\{product.sku\}<\/span>\s*\{product.brand && <span className="text-\[11px\] text-zinc-500 font-medium">\{product.brand\}<\/span>\}\s*<\/div>\s*<\/div>/g,
  `<div className="flex-1 min-w-0 flex items-start gap-3">
                  <div className="scale-75 origin-top-left shrink-0">
                    <DeviceImageThumbnail fallbackName={product.name} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-zinc-900 text-sm tracking-tight line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className="font-mono text-[10px] font-extrabold text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200">{product.sku}</span>
                      {product.brand && <span className="text-[11px] text-zinc-500 font-medium">{product.brand}</span>}
                    </div>
                  </div>
                </div>`
);

fs.writeFileSync('src/components/ProductsView.tsx', content);
