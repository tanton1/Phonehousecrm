import React from 'react';

export const DeviceImageThumbnail: React.FC<{ model?: string; color?: string; fallbackName?: string }> = ({ model = '', color = '', fallbackName = '' }) => {
  const colorLower = color.toLowerCase();
  const nameLower = fallbackName.toLowerCase();
  
  const isDesert = colorLower.includes('sa mạc') || colorLower.includes('desert');
  const isNatural = colorLower.includes('tự nhiên') || colorLower.includes('natural');
  const isBlue = colorLower.includes('xanh') || colorLower.includes('orange');
  const isPurple = colorLower.includes('tím') || colorLower.includes('rose');
  const isBlack = colorLower.includes('đen') || colorLower.includes('black') || nameLower.includes('đen');
  const isWhite = colorLower.includes('trắng') || colorLower.includes('white') || nameLower.includes('trắng');

  let bgGradient = 'from-[#d2b48c] via-[#c5a059] to-[#a8823b]';
  let borderColor = '#c5a059';

  if (isDesert) {
    bgGradient = 'from-[#e2cfb7] via-[#d0b497] to-[#b79673]';
    borderColor = '#c0a588';
  } else if (isNatural) {
    bgGradient = 'from-[#cfceca] via-[#b2b1ac] to-[#8e8d88]';
    borderColor = '#9e9d98';
  } else if (isBlue) {
    bgGradient = 'from-[#3a4f66] via-[#243342] to-[#121c24]';
    borderColor = '#34495e';
  } else if (isPurple) {
    bgGradient = 'from-[#5b4a64] via-[#3c2f44] to-[#251a2d]';
    borderColor = '#5c4866';
  } else if (isBlack) {
    bgGradient = 'from-[#444444] via-[#222222] to-[#0d0d0d]';
    borderColor = '#444444';
  } else if (isWhite) {
    bgGradient = 'from-[#ffffff] via-[#f1f3f5] to-[#dee2e6]';
    borderColor = '#ced4da';
  }

  const isAccessory = !model.toLowerCase().includes('iphone') && !nameLower.includes('iphone');
  
  // If it's explicitly an accessory/non-iphone, we could show a different shape, 
  // but the user requested "ứng dụng deviceimagethumbnail để xây hình ảnh cho các hình ảnh kho linh phụ kiện cũng như danh mục hàng hoá".
  // So we will use the same "device-like" thumbnail or adapt it slightly.

  return (
    <div className="relative w-16 h-20 sm:w-20 sm:h-24 shrink-0 rounded-2xl p-1 flex items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200 border border-zinc-200/80 shadow-xs group-hover:scale-105 transition-transform overflow-hidden">
      {/* Device Body */}
      <div 
        className={`w-full h-full rounded-xl bg-gradient-to-b ${bgGradient} relative shadow-md p-1 border flex flex-col justify-between`} 
        style={{ borderColor }}
      >
        {/* Top Camera Bump - Hide for accessories if needed, but let's keep it consistent or show a small variation */}
        {!isAccessory ? (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-black/25 backdrop-blur-xs p-0.5 grid grid-cols-2 gap-0.5 border border-white/20 shadow-inner">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
              <div className="w-0.5 h-0.5 rounded-full bg-orange-900/80" />
            </div>
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
              <div className="w-0.5 h-0.5 rounded-full bg-orange-900/80" />
            </div>
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center col-span-2 mx-auto">
              <div className="w-0.5 h-0.5 rounded-full bg-orange-900/80" />
            </div>
          </div>
        ) : (
           <div className="w-4 h-4 rounded-full bg-black/10 mx-auto mt-1 flex items-center justify-center shadow-inner">
             <div className="w-1 h-1 rounded-full bg-white/50" />
           </div>
        )}

        {/* Apple Logo Watermark / Accessory Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
          {!isAccessory ? (
            <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 170 170">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.14-1.9-14.4-6.08-3.38-2.73-7.3-7.42-11.78-14.07-6.09-9.03-10.87-19.12-14.34-30.27-3.47-11.16-5.2-21.84-5.2-32.06 0-14.54 3.66-26.28 10.98-35.22 7.32-8.94 16.54-13.48 27.67-13.62 4.79 0 10.02 1.18 15.68 3.55 5.66 2.37 9.4 3.61 11.22 3.73 1.95 0 5.86-1.32 11.73-3.95 5.88-2.63 10.88-3.87 15.01-3.72 10.32.53 18.91 4.3 25.77 11.31-9.28 5.6-13.82 13.51-13.62 23.73.26 8.08 3.34 14.88 9.24 20.4 5.9 5.52 13.06 8.65 21.48 9.39-2.12 6.27-4.8 12.51-8.04 18.72zM119.22 31.84c0-7.32 2.65-14.28 7.95-20.88 5.3-6.6 11.89-10.4 19.77-11.4 0.26 1.05.39 2.04.39 2.96 0 7.25-2.71 14.24-8.13 20.97-5.42 6.73-12.01 10.43-19.77 11.1-0.13-0.8-.21-1.7-.21-2.75z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white fill-current" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          )}
        </div>

        {/* Bottom Specs Reflection */}
        <div className="w-full text-center text-[7px] font-mono text-white/60 tracking-tighter truncate">
          {model ? model.replace('iPhone ', '') : (fallbackName.split(' ')[0] || 'PK')}
        </div>
      </div>
    </div>
  );
};
