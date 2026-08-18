import fs from 'fs';

let content = fs.readFileSync('src/components/MasterCatalogView.tsx', 'utf8');

content = content.replace(
  /<div className="w-12 h-12 rounded-xl bg-orange-50\/80 border border-orange-100\/90 flex-shrink-0 flex items-center justify-center overflow-hidden">\s*\{item.imageUrl \? \(\s*<img\s*src=\{item.imageUrl\}\s*alt=\{item.name\}\s*className="w-full h-full object-cover"\s*referrerPolicy="no-referrer"\s*onError=\{\(e\) => \{\s*\(e.target as HTMLElement\)\.style\.display = 'none';\s*\}\}\s*\/>\s*\) : item.category === 'DEVICE' \? \(\s*<Smartphone className="w-6 h-6 text-orange-400" \/>\s*\) : item.category === 'PART' \? \(\s*<Wrench className="w-6 h-6 text-orange-400" \/>\s*\) : \(\s*<Headphones className="w-6 h-6 text-orange-400" \/>\s*\)\}\s*<\/div>/g,
  `<div className="w-12 h-12 flex-shrink-0 flex items-center justify-center relative">
                  {item.imageUrl ? (
                    <div className="w-full h-full rounded-xl border border-zinc-200 overflow-hidden relative">
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="scale-75 origin-center">
                      <DeviceImageThumbnail model={item.category === 'DEVICE' ? item.name : undefined} color={item.color || ''} fallbackName={item.name} />
                    </div>
                  )}
                </div>`
);

fs.writeFileSync('src/components/MasterCatalogView.tsx', content);
