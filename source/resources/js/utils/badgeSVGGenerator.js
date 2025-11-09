/**
 * Badge SVG Generator
 * Creates Islamic-themed badge SVGs for different rarity levels
 */

/**
 * Generate SVG for a badge
 */
export const generateBadgeSVG = (badgeId, rarity = 'common', badgeName = '', category = 'General') => {
  const baseColors = {
    'common': { main: '#9CA3AF', accent: '#6B7280', glow: 'rgba(107, 114, 128, 0.3)' },
    'uncommon': { main: '#3B82F6', accent: '#1D4ED8', glow: 'rgba(59, 130, 246, 0.3)' },
    'rare': { main: '#10B981', accent: '#059669', glow: 'rgba(16, 185, 129, 0.4)' },
    'legendary': { main: '#8B5CF6', accent: '#7C3AED', glow: 'rgba(139, 92, 246, 0.5)' }
  };

  const colors = baseColors[rarity] || baseColors['common'];

  // Different SVG patterns for different badge IDs to add variety
  const pattern = badgeId % 4;
  const background = pattern === 0
    ? generateStarBackground(badgeId, colors)
    : pattern === 1
      ? generateCrescentBackground(badgeId, colors)
      : pattern === 2
        ? generateGeometricBackground(badgeId, colors)
        : generateCalligraphyBackground(badgeId, colors);

  const iconLayer = generateCategoryIcon(category, colors);

  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="badge-svg">
    <defs>
      <filter id="glow-${badgeId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="grad-${badgeId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${colors.main};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:1" />
      </linearGradient>
    </defs>
    ${background}
    ${iconLayer}
  </svg>`;
};
function generateStarBackground(badgeId, colors) {
  return `
    <circle cx="60" cy="60" r="55" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
    <circle cx="60" cy="60" r="48" fill="white" opacity="0.95"/>
    <g transform="translate(60, 35)">
      <path d="M 0,-15 L 4,-4 L 15,-2 L 8,4 L 10,15 L 0,10 L -10,15 L -8,4 L -15,-2 L -4,-4 Z"
            fill="${colors.main}" opacity="0.75"/>
    </g>
    <g transform="translate(60, 60)">
      <circle cx="0" cy="0" r="14" fill="none" stroke="${colors.accent}" stroke-width="1.5" opacity="0.45"/>
      <circle cx="0" cy="0" r="9" fill="none" stroke="${colors.accent}" stroke-width="1" opacity="0.35"/>
      <line x1="-14" y1="0" x2="14" y2="0" stroke="${colors.accent}" stroke-width="0.6" opacity="0.4"/>
      <line x1="0" y1="-14" x2="0" y2="14" stroke="${colors.accent}" stroke-width="0.6" opacity="0.4"/>
    </g>
    <circle cx="20" cy="20" r="2" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="100" cy="20" r="2" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="20" cy="100" r="2" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="100" cy="100" r="2" fill="${colors.accent}" opacity="0.55"/>
  `;
}

function generateCrescentBackground(badgeId, colors) {
  return `
    <circle cx="60" cy="60" r="55" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
    <circle cx="60" cy="60" r="48" fill="white" opacity="0.95"/>
    <g transform="translate(60, 60)">
      <circle cx="0" cy="-3" r="20" fill="${colors.main}" opacity="0.85"/>
      <circle cx="6" cy="-5" r="17" fill="white" opacity="0.95"/>
    </g>
    <circle cx="60" cy="30" r="3" fill="${colors.accent}" opacity="0.65"/>
    <circle cx="90" cy="60" r="3" fill="${colors.accent}" opacity="0.65"/>
    <circle cx="60" cy="90" r="3" fill="${colors.accent}" opacity="0.65"/>
    <circle cx="30" cy="60" r="3" fill="${colors.accent}" opacity="0.65"/>
    <path d="M 46 44 A 22 22 0 0 1 74 44" stroke="${colors.accent}" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M 46 78 A 22 22 0 0 0 74 78" stroke="${colors.accent}" stroke-width="1" fill="none" opacity="0.4"/>
  `;
}

function generateGeometricBackground(badgeId, colors) {
  return `
    <circle cx="60" cy="60" r="55" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
    <circle cx="60" cy="60" r="48" fill="white" opacity="0.95"/>
    <g transform="translate(60, 60)">
      <polygon points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"
               fill="none" stroke="${colors.main}" stroke-width="2" opacity="0.8"/>
      <polygon points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4"
               fill="${colors.accent}" opacity="0.35"/>
      <circle cx="0" cy="-16" r="2" fill="${colors.accent}" opacity="0.7"/>
      <circle cx="14" cy="-8" r="2" fill="${colors.accent}" opacity="0.7"/>
      <circle cx="14" cy="8" r="2" fill="${colors.accent}" opacity="0.7"/>
      <circle cx="0" cy="16" r="2" fill="${colors.accent}" opacity="0.7"/>
      <circle cx="-14" cy="8" r="2" fill="${colors.accent}" opacity="0.7"/>
      <circle cx="-14" cy="-8" r="2" fill="${colors.accent}" opacity="0.7"/>
    </g>
  `;
}

function generateCalligraphyBackground(badgeId, colors) {
  return `
    <circle cx="60" cy="60" r="55" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
    <circle cx="60" cy="60" r="48" fill="white" opacity="0.95"/>
    <g transform="translate(60, 60)" opacity="0.8">
      <path d="M -6,-10 Q -9,-4 -4,0 Q -2,3 0,2 Q 3,3 5,0 Q 8,-4 6,-10 Q 0,-14 -6,-10"
            fill="${colors.accent}"/>
      <path d="M -14,-4 Q -8,0 -4,-4" stroke="${colors.main}" stroke-width="1.6" fill="none" opacity="0.7"/>
      <path d="M 14,-4 Q 8,0 4,-4" stroke="${colors.main}" stroke-width="1.6" fill="none" opacity="0.7"/>
      <path d="M -10,12 Q 0,16 10,12" stroke="${colors.main}" stroke-width="1.6" fill="none" opacity="0.7"/>
    </g>
    <circle cx="60" cy="24" r="1.8" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="96" cy="60" r="1.8" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="60" cy="96" r="1.8" fill="${colors.accent}" opacity="0.55"/>
    <circle cx="24" cy="60" r="1.8" fill="${colors.accent}" opacity="0.55"/>
  `;
}

function generateCategoryIcon(category, colors) {
  const iconMap = {
    'General': generateBookIcon,
    'Virtue': generateHeartIcon,
    'Performance': generateTrophyIcon,
    'Progress': generateArrowIcon,
    'Hadith-Based': generateHadithIcon,
    'Story-Based': generateStoryIcon,
    'Special': generateCrescentStarIcon,
    'Guardian': generateCrescentStarIcon
  };

  const iconGenerator = iconMap[category] || generateDefaultIcon;
  return iconGenerator(colors);
}

function generateBookIcon(colors) {
  return `
    <g transform="translate(60, 62)">
      <path d="M -28 -22 H -8 Q -2 -22 -2 -16 V 18 Q -2 24 -8 24 H -28 Z" fill="${colors.main}" opacity="0.85"/>
      <path d="M 28 -22 H 8 Q 2 -22 2 -16 V 18 Q 2 24 8 24 H 28 Z" fill="${colors.accent}" opacity="0.85"/>
      <rect x="-2" y="-22" width="4" height="46" fill="white" opacity="0.9" rx="1.5"/>
      <line x1="-8" y1="-8" x2="-8" y2="18" stroke="white" stroke-width="2" opacity="0.6"/>
      <line x1="8" y1="-8" x2="8" y2="18" stroke="white" stroke-width="2" opacity="0.6"/>
    </g>
  `;
}

function generateHeartIcon(colors) {
  return `
    <g transform="translate(60, 66)">
      <path d="M 0 20 C -18 6 -26 -6 -16 -16 C -8 -24 0 -16 0 -10 C 0 -16 8 -24 16 -16 C 26 -6 18 6 0 20" 
            fill="${colors.main}" opacity="0.85"/>
      <path d="M 0 12 C -12 2 -18 -4 -10 -12 C -4 -18 0 -12 0 -8 C 0 -12 4 -18 10 -12 C 18 -4 12 2 0 12"
            fill="white" opacity="0.35"/>
      <circle cx="0" cy="-20" r="6" fill="${colors.accent}" opacity="0.8"/>
    </g>
  `;
}

function generateTrophyIcon(colors) {
  return `
    <g transform="translate(60, 60)">
      <path d="M -18 -24 H 18 Q 22 -24 22 -20 V -10 Q 22 -2 10 2 Q 8 14 8 18 H -8 Q -8 14 -10 2 Q -22 -2 -22 -10 V -20 Q -22 -24 -18 -24 Z"
            fill="${colors.main}" opacity="0.85"/>
      <path d="M -12 -24 H 12 V -18 Q 12 -8 0 -4 Q -12 -8 -12 -18 Z" fill="${colors.accent}" opacity="0.7"/>
      <rect x="-6" y="18" width="12" height="8" fill="${colors.accent}" opacity="0.9" rx="2"/>
      <rect x="-14" y="26" width="28" height="6" fill="${colors.main}" opacity="0.9" rx="3"/>
    </g>
  `;
}

function generateArrowIcon(colors) {
  return `
    <g transform="translate(60, 60)">
      <path d="M -12 24 L 0 4 L 12 24" fill="${colors.accent}" opacity="0.8"/>
      <rect x="-6" y="-20" width="12" height="36" fill="${colors.main}" rx="4" opacity="0.8"/>
      <polygon points="0,-34 12,-16 -12,-16" fill="${colors.accent}" opacity="0.9"/>
    </g>
  `;
}

function generateHadithIcon(colors) {
  return `
    <g transform="translate(60, 60)">
      <rect x="-26" y="-22" width="52" height="44" rx="8" fill="${colors.main}" opacity="0.85"/>
      <rect x="-20" y="-16" width="40" height="32" rx="6" fill="white" opacity="0.92"/>
      <path d="M -14 -6 Q 0 -18 14 -6" stroke="${colors.accent}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M -14 4 Q 0 16 14 4" stroke="${colors.accent}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="-1" r="3" fill="${colors.accent}"/>
    </g>
  `;
}

function generateStoryIcon(colors) {
  return `
    <g transform="translate(60, 62)">
      <path d="M -24 -18 H 12 C 20 -18 24 -12 24 -4 V 22 C 24 12 18 6 10 6 H -24 Z"
            fill="${colors.main}" opacity="0.85"/>
      <path d="M -18 -12 H 6 C 12 -12 16 -8 16 -2 V 18 C 14 10 8 6 2 6 H -18 Z"
            fill="white" opacity="0.3"/>
      <path d="M -12 -2 Q 0 6 -12 14" stroke="${colors.accent}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="-2" cy="2" r="3" fill="${colors.accent}"/>
    </g>
  `;
}

function generateCrescentStarIcon(colors) {
  return `
    <g transform="translate(60, 60)">
      <circle cx="-6" cy="0" r="18" fill="${colors.main}" opacity="0.85"/>
      <circle cx="0" cy="0" r="14" fill="white" opacity="0.95"/>
      <polygon points="12,0 16,6 24,7 18,12 20,20 12,16 4,20 6,12 0,7 8,6" fill="${colors.accent}" opacity="0.85"/>
    </g>
  `;
}

function generateDefaultIcon(colors) {
  return `
    <g transform="translate(60, 60)">
      <circle cx="0" cy="0" r="20" fill="${colors.main}" opacity="0.75"/>
      <circle cx="0" cy="0" r="12" fill="${colors.accent}" opacity="0.6"/>
      <circle cx="0" cy="0" r="6" fill="white" opacity="0.8"/>
    </g>
  `;
}

/**
 * Generate locked badge placeholder
 */
export const generateLockedBadgeSVG = () => {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="badge-svg">
    <defs>
      <linearGradient id="grad-locked" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#D1D5DB;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#9CA3AF;stop-opacity:1" />
      </linearGradient>
    </defs>
    
    <!-- Outer circle -->
    <circle cx="60" cy="60" r="55" fill="url(#grad-locked)"/>
    
    <!-- Inner circle -->
    <circle cx="60" cy="60" r="48" fill="white" opacity="0.95"/>
    
    <!-- Question mark -->
    <text x="60" y="75" font-size="48" font-weight="bold" text-anchor="middle" 
          fill="#9CA3AF" font-family="Arial, sans-serif">?</text>
    
    <!-- Decorative circles -->
    <circle cx="60" cy="25" r="2" fill="#9CA3AF" opacity="0.5"/>
    <circle cx="95" cy="60" r="2" fill="#9CA3AF" opacity="0.5"/>
    <circle cx="60" cy="95" r="2" fill="#9CA3AF" opacity="0.5"/>
    <circle cx="25" cy="60" r="2" fill="#9CA3AF" opacity="0.5"/>
  </svg>`;
};

/**
 * Generate badge frame with border
 */
export const wrapBadgeWithBorder = (svgContent, rarity) => {
  const borderColors = {
    'common': '#9CA3AF',
    'uncommon': '#3B82F6',
    'rare': '#10B981',
    'legendary': '#8B5CF6'
  };

  const borderColor = borderColors[rarity] || borderColors['common'];
  const borderWidth = rarity === 'legendary' ? 4 : rarity === 'rare' ? 3 : rarity === 'uncommon' ? 2 : 1;

  return `<div class="badge-container" style="
    border: ${borderWidth}px solid ${borderColor};
    border-radius: 12px;
    padding: 4px;
    background: white;
    ${rarity === 'legendary' ? `box-shadow: 0 0 20px ${borderColor}, 0 0 40px rgba(139, 92, 246, 0.4);` : 
      rarity === 'rare' ? `box-shadow: 0 0 15px ${borderColor}, 0 0 30px rgba(16, 185, 129, 0.3);` :
      rarity === 'uncommon' ? `box-shadow: 0 0 10px ${borderColor};` : ''}
  ">
    ${svgContent}
  </div>`;
};

/**
 * Get rarity color scheme
 */
export const getRarityColorScheme = (rarity) => {
  const schemes = {
    'common': { border: '#9CA3AF', glow: 'rgba(107, 114, 128, 0.3)', text: '#6B7280' },
    'uncommon': { border: '#3B82F6', glow: 'rgba(59, 130, 246, 0.3)', text: '#1D4ED8' },
    'rare': { border: '#10B981', glow: 'rgba(16, 185, 129, 0.4)', text: '#059669' },
    'legendary': { border: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.5)', text: '#7C3AED' }
  };
  return schemes[rarity] || schemes['common'];
};

/**
 * Get badge size class based on rarity
 */
export const getBadgeSizeClass = (rarity) => {
  const sizes = {
    'common': 'w-20 h-20',
    'uncommon': 'w-24 h-24',
    'rare': 'w-28 h-28',
    'legendary': 'w-32 h-32'
  };
  return sizes[rarity] || sizes['common'];
};
