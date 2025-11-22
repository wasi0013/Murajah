/**
 * Badge SVG Generator
 * Creates Islamic-themed badge SVGs for different rarity levels
 */

/**
 * Generate SVG for a badge
 * arabicText: Arabic name (no diacritics) preferred; falls back to badgeName
 */
export const generateBadgeSVG = (badgeId, rarity = 'common', badgeName = '', category = 'General', arabicText = '') => {
  const baseColors = {
    'common': { main: '#10B981', accent: '#059669', glow: 'rgba(16, 185, 129, 0.35)' }, // green
    'uncommon': { main: '#3B82F6', accent: '#1D4ED8', glow: 'rgba(59, 130, 246, 0.3)' }, // blue
    'rare': { main: '#F59E0B', accent: '#D97706', glow: 'rgba(245, 158, 11, 0.4)' },     // amber/orange
    'legendary': { main: '#8B5CF6', accent: '#7C3AED', glow: 'rgba(139, 92, 246, 0.5)' } // purple
  };

  const colors = baseColors[rarity] || baseColors['common'];

  // Different SVG patterns for different badge IDs to add variety
  const pattern = badgeId % 4;
  const shape = getRarityShape(rarity);
  const background = generateShapedBackground(badgeId, colors, pattern, shape);

  // Subtle icon layer (further reduced opacity to prioritize Arabic text)
  const iconLayer = `<g opacity="0.15">${generateCategoryIcon(category, colors)}</g>`;

  const frameLayer = generateOrnateFrame(badgeId, rarity, category, colors);

  const displayText = (arabicText && arabicText.trim().length > 0) ? arabicText : badgeName;
  const textSpec = getArabicTextSpec(displayText);
  const tspans = textSpec.lines.map((line, idx) => {
    const dy = idx === 0 ? textSpec.firstLineDy : textSpec.lineHeight;
    const letterSpacing = 'letter-spacing:-0.3px;';
    return `<tspan x="0" dy="${dy}" style="${letterSpacing}">${escapeXml(line)}</tspan>`;
  }).join('');

  const textLayer = `
    <g transform="translate(60, 60)">
      <text x="0" y="0" font-size="${textSpec.fontSize}" text-anchor="middle" dominant-baseline="middle"
            font-family="'Amiri','Scheherazade New','Noto Naskh Arabic','Arial',sans-serif"
            fill="${colors.accent}" style="direction: rtl; unicode-bidi: bidi-override; font-weight: 700;">
        ${tspans}
      </text>
    </g>`;

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
      <clipPath id="clip-${badgeId}">
        ${shape}
      </clipPath>
    </defs>
    ${background}
    ${frameLayer}
    ${iconLayer}
    ${textLayer}
  </svg>`;
};

// Determine a pleasant font size based on text length
function getArabicFontSize(text) {
  const len = (text || '').length;
  if (len <= 8) return 26;
  if (len <= 12) return 22;
  if (len <= 16) return 18;
  if (len <= 24) return 16;
  return 14;
}

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generate ornate frame around center text, varies by rarity & category
function generateOrnateFrame(badgeId, rarity, category, colors) {
  const thickness = rarity === 'legendary' ? 4 : rarity === 'rare' ? 3.5 : rarity === 'uncommon' ? 3 : 2.5;
  const border = colors.main;
  const accent = colors.accent;
  const crown = rarity === 'legendary' ? `<circle cx="60" cy="14" r="4" fill="${accent}" opacity="0.95"/>
    <path d="M50,22 L70,22 L60,10 Z" fill="${accent}" opacity="0.55"/>` : '';

  const outerShapePath = getFrameShapePath(rarity); // stroke path
  const innerInsetShape = getInsetShape(rarity, 6); // white backdrop inset

  const motif = (cat => {
    switch (cat) {
      case 'General': return generateDistributedMotifs(rarity, accent, 'dot');
      case 'Virtue': return generateDistributedMotifs(rarity, accent, 'petal');
      case 'Performance': return generateDistributedMotifs(rarity, accent, 'tick');
      case 'Progress': return generateDistributedMotifs(rarity, accent, 'arrow');
      case 'Hadith-Based': return generateDistributedMotifs(rarity, accent, 'bookmark');
      case 'Story-Based': return generateDistributedMotifs(rarity, accent, 'scroll');
      default: return generateDistributedMotifs(rarity, accent, 'dot');
    }
  })(category);

  return `
    <g>
      <path d="${outerShapePath}" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})" opacity="0.30"/>
      <path d="${innerInsetShape}" fill="white" opacity="0.94"/>
      <path d="${outerShapePath}" fill="none" stroke="${border}" stroke-width="${thickness}" opacity="0.75"/>
      ${motif}
      ${crown}
    </g>`;
}

function generateRingDots(cx, cy, r, color, count) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="${color}" opacity="0.6"/>`);
  }
  return dots.join('');
}

function generatePetals(cx, cy, r, color, count) {
  const petals = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    petals.push(`<path d="M ${x} ${y} q 4 -6 8 0 q -4 6 -8 0" fill="${color}" opacity="0.35"/>`);
  }
  return petals.join('');
}

function generateTicks(cx, cy, r, color, count) {
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x1 = cx + (r - 3) * Math.cos(a);
    const y1 = cy + (r - 3) * Math.sin(a);
    const x2 = cx + (r + 3) * Math.cos(a);
    const y2 = cy + (r + 3) * Math.sin(a);
    ticks.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="1.2" opacity="0.5"/>`);
  }
  return ticks.join('');
}

function generateArrows(cx, cy, r, color, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const rot = (a * 180) / Math.PI + 90;
    arr.push(`<polygon points="${x},${y - 3} ${x - 3},${y + 3} ${x + 3},${y + 3}" fill="${color}" opacity="0.55" transform="rotate(${rot} ${x} ${y})"/>`);
  }
  return arr.join('');
}

function generateBookMarks(cx, cy, r, color, count) {
  const marks = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    marks.push(`<rect x="${(x - 2).toFixed(2)}" y="${(y - 6).toFixed(2)}" width="4" height="8" rx="1" fill="${color}" opacity="0.45"/>`);
  }
  return marks.join('');
}

function generateScrolls(cx, cy, r, color, count) {
  const sc = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    sc.push(`<path d="M ${x - 3} ${y} q 3 -4 6 0 q -3 4 -6 0" fill="${color}" opacity="0.4"/>`);
  }
  return sc.join('');
}

// Frame shape path (outer outline)
function getFrameShapePath(rarity) {
  switch (rarity) {
    case 'legendary': // hexagon
      return 'M60 8 L104 34 L104 86 L60 112 L16 86 L16 34 Z';
    case 'rare': // pentagon
      return 'M60 10 L104 46 L86 104 L34 104 L16 46 Z';
    case 'uncommon': // square
      return 'M16 16 H104 V104 H16 Z';
    case 'common': // circle (approx via path for consistent styling)
    default:
      return 'M60 8 A52 52 0 1 1 59.999 8 Z';
  }
}

// Inset shape for white background
function getInsetShape(rarity, inset) {
  switch (rarity) {
    case 'legendary':
      return 'M60 14 L98 36 L98 84 L60 106 L22 84 L22 36 Z';
    case 'rare':
      return 'M60 18 L96 50 L82 98 L38 98 L24 50 Z';
    case 'uncommon':
      return 'M22 22 H98 V98 H22 Z';
    case 'common':
    default:
      return 'M60 14 A46 46 0 1 1 59.999 14 Z';
  }
}

// Generate motifs distributed along shape perimeter by sampling angles or segment interpolation
function generateDistributedMotifs(rarity, color, type) {
  // Use circle sampling for simplicity; shapes still look good with radial distribution
  const cx = 60, cy = 60, r = rarity === 'legendary' ? 48 : rarity === 'rare' ? 46 : rarity === 'uncommon' ? 44 : 42;
  const count = rarity === 'legendary' ? 14 : rarity === 'rare' ? 12 : rarity === 'uncommon' ? 10 : 8;
  const items = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    switch (type) {
      case 'dot':
  items.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.8" fill="${color}" opacity="0.4"/>`);
        break;
      case 'petal':
  items.push(`<path d="M ${x.toFixed(2)} ${y.toFixed(2)} q 3 -5 6 0 q -3 5 -6 0" fill="${color}" opacity="0.3"/>`);
        break;
      case 'tick':
        const x2 = cx + (r - 4) * Math.cos(a);
        const y2 = cy + (r - 4) * Math.sin(a);
  items.push(`<line x1="${x2.toFixed(2)}" y1="${y2.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${color}" stroke-width="1.4" opacity="0.35"/>`);
        break;
      case 'arrow':
        const rot = (a * 180) / Math.PI + 90;
  items.push(`<polygon points="${x},${y - 3} ${x - 3},${y + 3} ${x + 3},${y + 3}" fill="${color}" opacity="0.35" transform="rotate(${rot} ${x} ${y})"/>`);
        break;
      case 'bookmark':
  items.push(`<rect x="${(x - 2).toFixed(2)}" y="${(y - 6).toFixed(2)}" width="4" height="8" rx="1" fill="${color}" opacity="0.3"/>`);
        break;
      case 'scroll':
  items.push(`<path d="M ${x - 3} ${y} q 3 -4 6 0 q -3 4 -6 0" fill="${color}" opacity="0.3"/>`);
        break;
    }
  }
  return items.join('');
}

// Build multi-line Arabic layout spec to avoid overflow
function getArabicTextSpec(text) {
  const t = (text || '').trim();
  if (!t) {
    return { fontSize: 18, lineHeight: 20, firstLineDy: 0, lines: [''], needsTight: [false] };
  }
  const len = t.length;
  const targetLines = len <= 10 ? 1 : (len <= 20 ? 2 : 3);
  const lineCharLimit = Math.max(6, Math.ceil(len / targetLines) + 1);
  let lines = wrapArabicToLines(t, targetLines, lineCharLimit);
  // Special case: exactly two long words -> force 2 lines if needed
  if (targetLines === 1) {
    const parts = t.split(' ');
    if (parts.length === 2 && t.length > 12) {
      lines = [parts[0], parts[1]];
    }
  }

  // Adjust font size by number of lines and longest line length
  const longest = Math.max(...lines.map(l => l.length));
  // Harmonize sizes: single line slightly smaller to avoid visual dominance
  let fontSize = targetLines === 1 ? 20 : targetLines === 2 ? 16 : 13;
  if (longest > lineCharLimit + 2) fontSize -= 2;
  if (longest > lineCharLimit + 6) fontSize -= 2;
  // If exactly two lines and both are fairly long, reduce a bit more
  if (lines.length === 2 && (lines[0].length > 10 || lines[1].length > 10)) {
    fontSize -= 2;
  }
  if (fontSize < 11) fontSize = 11;

  const lineHeight = Math.round(fontSize * 1.2);
  const totalHeight = lineHeight * lines.length;
  const firstLineDy = -((totalHeight - lineHeight) / 2);
  const needsTight = lines.map(l => l.length > lineCharLimit + 2);
  return { fontSize, lineHeight, firstLineDy, lines, needsTight };
}

function wrapArabicToLines(text, maxLines, limit) {
  // Treat em-dash and hyphens as break opportunities
  const normalized = text.replace(/—/g, ' — ').replace(/-/g, ' - ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    if ((current + ' ' + w).length <= limit) {
      current = current + ' ' + w;
    } else {
      lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) {
        // Last line: dump the rest
        const rest = words.slice(words.indexOf(w) + 1).join(' ');
        if (rest) current = current + ' ' + rest;
        break;
      }
    }
  }
  if (current) lines.push(current);

  // If lines still exceed maxLines (due to long words), hard-split
  while (lines.length > maxLines) {
    const moved = lines.pop();
    lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + moved).trim();
  }
  // Split any overlong words within lines
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > limit + 8) {
      lines[i] = hardSplit(lines[i], limit).join('\n');
    }
  }
  // Flatten accidental newlines into extra lines up to maxLines
  const flat = [];
  for (const L of lines) {
    const parts = L.split('\n');
    for (const p of parts) flat.push(p);
  }
  return flat.slice(0, maxLines).map(s => s.trim());
}

function hardSplit(str, limit) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    out.push(str.slice(i, i + limit));
    i += limit;
  }
  return out;
}
function generateStarBackground(badgeId, colors) {
  return `
    <g clip-path="url(#clip-${badgeId})">
      <rect x="5" y="5" width="110" height="110" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
      <rect x="10" y="10" width="100" height="100" fill="white" opacity="0.95"/>
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
    </g>
  `;
}

function generateCrescentBackground(badgeId, colors) {
  return `
    <g clip-path="url(#clip-${badgeId})">
      <rect x="5" y="5" width="110" height="110" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
      <rect x="10" y="10" width="100" height="100" fill="white" opacity="0.95"/>
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
    </g>
  `;
}

function generateGeometricBackground(badgeId, colors) {
  return `
    <g clip-path="url(#clip-${badgeId})">
      <rect x="5" y="5" width="110" height="110" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
      <rect x="10" y="10" width="100" height="100" fill="white" opacity="0.95"/>
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
    <g clip-path="url(#clip-${badgeId})">
      <rect x="5" y="5" width="110" height="110" fill="url(#grad-${badgeId})" filter="url(#glow-${badgeId})"/>
      <rect x="10" y="10" width="100" height="100" fill="white" opacity="0.95"/>
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
    </g>
  `;
}

function getRarityShape(rarity) {
  switch (rarity) {
    case 'legendary': // hexagon
      return `<polygon points="60,8 104,34 104,86 60,112 16,86 16,34"/>`;
    case 'rare': // pentagon
      return `<polygon points="60,10 104,46 86,104 34,104 16,46"/>`;
    case 'uncommon': // square
      return `<rect x="16" y="16" width="88" height="88" rx="8"/>`;
    case 'common': // circle
    default:
      return `<circle cx="60" cy="60" r="52"/>`;
  }
}

function generateShapedBackground(badgeId, colors, pattern, shape) {
  // pattern selects decorative overlay, but we already adapt existing functions
  switch (pattern) {
    case 0: return generateStarBackground(badgeId, colors);
    case 1: return generateCrescentBackground(badgeId, colors);
    case 2: return generateGeometricBackground(badgeId, colors);
    default: return generateCalligraphyBackground(badgeId, colors);
  }
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
    'common': { border: '#10B981', glow: 'rgba(16, 185, 129, 0.35)', text: '#059669' },
    'uncommon': { border: '#3B82F6', glow: 'rgba(59, 130, 246, 0.3)', text: '#1D4ED8' },
    'rare': { border: '#F59E0B', glow: 'rgba(245, 158, 11, 0.4)', text: '#D97706' },
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
