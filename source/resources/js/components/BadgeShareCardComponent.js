/**
 * Badge Share Card Component
 * 1:1 square aspect ratio with badge SVG, rarity styling, backstory, and domain footer
 */

import { generateBadgeSVG, getRarityColorScheme } from '../utils/badgeSVGGenerator.js';

export default {
  template: `
    <!-- Badge Share Card (1:1 Square) -->
    <!-- This div is rendered to PNG for sharing -->
    <!-- Using inline styles instead of Tailwind for better html2canvas compatibility -->
    <div ref="cardRef" 
         style="position: relative; width: 400px; height: 400px; border-radius: 24px; overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;"
         :style="{
           ...getCardBackground(),
           boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
         }">
      
      <!-- Gradient overlay for rarity -->
      <div style="position: absolute; inset: 0; opacity: 0.4; pointer-events: none;"
           :style="{ background: getCardGradient() }"></div>
      
      <!-- Content Container -->
      <div style="position: relative; height: 100%; display: flex; flex-direction: column; padding: 24px; justify-content: space-between;">
        
        <!-- Top Section: Badge SVG -->
        <div style="display: flex; justify-content: center; align-items: flex-start; padding-top: 16px;">
          <div style="width: 128px; height: 128px; flex-shrink: 0;">
            <div 
              style="width: 100%; height: 100%;"
              v-html="generateBadgeSVG(badge.id, badge.rarity, badge.name, badge.category, badge.ar)"
            ></div>
          </div>
        </div>
        
        <!-- Middle Section: Badge Info & Backstory -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 8px; gap: 12px;">
          <!-- Badge Name -->
          <h2 style="font-size: 24px; font-weight: 900; text-align: center; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1); letter-spacing: -0.5px;"
              :style="{ color: getRarityColorScheme(badge.rarity).border }">
            {{ badge.name }}
          </h2>
          
          <!-- Rarity Badge -->
          <div style="display: inline-block; padding: 4px 16px; border-radius: 9999px; font-size: 12px; font-weight: 900; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2); box-shadow: 0 2px 4px rgba(0,0,0,0.15);"
               :style="{ backgroundColor: getRarityColorScheme(badge.rarity).border }">
            ◆ {{ badge.rarity.toUpperCase() }} ◆
          </div>
          
          <!-- Backstory Text (truncated for card) -->
          <p style="font-size: 14px; text-align: center; color: #1f2937; line-height: 1.4; font-weight: 600; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 1px 2px rgba(255,255,255,0.8);">
            {{ truncateBackstory(badge.backstory, 120) }}
          </p>
        </div>
        
        <!-- Bottom Section: Domain Footer -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 8px; border-top: 2px solid;"
             :style="{ borderTopColor: getRarityColorScheme(badge.rarity).border }">
          <p style="font-size: 12px; font-weight: 900; color: #374151; margin: 0; text-shadow: 0 1px 2px rgba(255,255,255,0.8);">ACHIEVEMENT UNLOCKED</p>
          <p style="font-size: 14px; font-weight: 900; letter-spacing: 0.05em; margin: 0; text-shadow: 0 1px 2px rgba(255,255,255,0.8);"
             :style="{ color: getRarityColorScheme(badge.rarity).border }">
            murajah.pages.dev
          </p>
        </div>
      </div>
      
      <!-- Corner Accent (Pokémon card style) -->
      <div style="position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border-radius: 50%; opacity: 0.3;"
           :style="{ backgroundColor: getRarityColorScheme(badge.rarity).border }"></div>
      <div style="position: absolute; bottom: 8px; left: 8px; width: 24px; height: 24px; border-radius: 50%; opacity: 0.2;"
           :style="{ backgroundColor: getRarityColorScheme(badge.rarity).border }"></div>
    </div>
  `,

  props: {
    badge: {
      type: Object,
      required: true,
      default: () => ({
        id: 1,
        name: 'Achievement',
        rarity: 'common',
        category: 'General',
        backstory: 'Loading...',
        ar: ''
      })
    }
  },

  setup(props) {
    const getCardBackground = () => {
      const rarityColor = getRarityColorScheme(props.badge.rarity);
      const baseColors = {
        'common': '#F0FDF4',    // light green
        'uncommon': '#EFF6FF', // light blue
        'rare': '#FFFBEB',      // light amber
        'legendary': '#FAF5FF'  // light purple
      };
      
      return {
        backgroundColor: baseColors[props.badge.rarity] || baseColors['common'],
        backgroundImage: `linear-gradient(135deg, ${rarityColor.main}15, ${rarityColor.accent}15)`,
        boxShadow: `0 20px 60px ${rarityColor.glow}`
      };
    };

    const getCardGradient = () => {
      const rarityColor = getRarityColorScheme(props.badge.rarity);
      return `linear-gradient(135deg, ${rarityColor.main}, ${rarityColor.accent})`;
    };

    const truncateBackstory = (text, maxLength) => {
      if (!text) return 'Achievement unlocked!';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    };

    return {
      generateBadgeSVG,
      getRarityColorScheme,
      getCardBackground,
      getCardGradient,
      truncateBackstory
    };
  }
};
