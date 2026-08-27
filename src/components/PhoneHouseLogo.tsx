import React from 'react';

interface PhoneHouseLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  textColor?: string;
  className?: string;
}

export const PhoneHouseLogo: React.FC<PhoneHouseLogoProps> = ({
  size = 'md',
  showText = true,
  textColor = 'text-zinc-900',
  className = ''
}) => {
  // Dimension mappings
  const dimensions = {
    sm: { icon: 28, height: 28, text: 'text-xs tracking-wider', sub: 'text-[8px]' },
    md: { icon: 38, height: 38, text: 'text-sm tracking-widest font-black', sub: 'text-[9px]' },
    lg: { icon: 56, height: 56, text: 'text-lg tracking-widest font-black', sub: 'text-[10px]' },
    xl: { icon: 84, height: 84, text: 'text-2xl tracking-[0.2em] font-black', sub: 'text-xs' },
    '2xl': { icon: 110, height: 110, text: 'text-3xl tracking-[0.25em] font-black', sub: 'text-sm' }
  }[size];

  return (
    <div className={`inline-flex items-center space-x-3 select-none ${className}`}>
      {/* SVG Icon matching the exact shape of Phone House from IMG_6050 */}
      <div
        style={{ width: dimensions.icon, height: dimensions.icon }}
        className="relative flex-shrink-0 flex items-center justify-center filter drop-shadow-xs"
      >
        <svg
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background subtle rounded container if needed or pure crisp vector */}

          {/* Left Vertical Bar (Vibrant Orange) */}
          <rect
            x="20"
            y="20"
            width="46"
            height="160"
            rx="2"
            fill="#ff4b16"
          />

          {/* Right Vertical Bar (Dark Graphite Charcoal) */}
          <rect
            x="134"
            y="20"
            width="46"
            height="160"
            rx="2"
            fill="#2F333B"
          />

          {/* Curved Swoosh Bridge connecting Left Bar to Top Right (Orange) */}
          <path
            d="M66 98 C 95 106, 125 76, 134 20 L 178 20 C 178 20, 160 98, 118 128 C 90 148, 66 128, 66 128 Z"
            fill="#ff4b16"
          />

          {/* Shadow accent on the right bar cutout for 3D depth */}
          <path
            d="M 134 40 C 145 75, 138 108, 134 125 L 134 40 Z"
            fill="#23262D"
            opacity="0.5"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span
            className={`font-black font-sans uppercase ${textColor} ${dimensions.text} leading-tight`}
            style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
          >
            PHONE HOUSE
          </span>
          <span className={`text-orange-600 font-bold uppercase tracking-wider ${dimensions.sub} leading-none mt-0.5`}>
            Apple Premium Retail
          </span>
        </div>
      )}
    </div>
  );
};
