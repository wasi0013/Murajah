/**
 * Badge Share Utility
 * Handles conversion of badge cards to PNG images and clipboard operations
 */

/**
 * Convert a DOM element containing the badge card to a PNG blob
 * Uses html2canvas to render the card directly
 * 
 * @param {HTMLElement} cardElement - The badge card div to convert
 * @param {number} scale - Scale factor for high DPI (default: 2 for 2x rendering)
 * @returns {Promise<Blob>} PNG image blob
 */
export const cardElementToBlob = async (cardElement, scale = 2) => {
  if (!cardElement) {
    throw new Error('Card element not found');
  }

  if (!window.html2canvas) {
    throw new Error('html2canvas library not loaded. Please refresh the page and try again.');
  }

  try {
    // Render the element directly using html2canvas
    // The element should already be in the DOM at this point
    const canvas = await window.html2canvas(cardElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      foreignObjectRendering: false,
      windowHeight: 400,
      windowWidth: 400
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('[Murajah] Badge card rendered successfully');
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png');
    });
  } catch (error) {
    console.error('[Murajah] html2canvas rendering failed:', error);
    throw new Error(`Failed to render badge card: ${error.message}`);
  }
};
/**
 * Copy an image blob to clipboard
 * Supports modern Clipboard API and fallback methods
 * 
 * @param {Blob} imageBlob - PNG image blob to copy
 * @returns {Promise<boolean>} True if successful
 */
export const copyImageToClipboard = async (imageBlob) => {
  try {
    // Modern Clipboard API (works in Chrome/Edge 63+, Firefox 63+, Safari 13.1+)
    if (navigator.clipboard && navigator.clipboard.write) {
      const data = [new ClipboardItem({ 'image/png': imageBlob })];
      await navigator.clipboard.write(data);
      console.log('[Murajah] Badge card image copied to clipboard');
      return true;
    } else {
      console.warn('[Murajah] Clipboard API not fully supported, attempting fallback');
      return false;
    }
  } catch (error) {
    console.error('[Murajah] Failed to copy image to clipboard:', error);
    return false;
  }
};

/**
 * Download an image blob to the user's device
 * 
 * @param {Blob} imageBlob - PNG image blob to download
 * @param {string} filename - Filename for the download
 */
export const downloadImageBlob = (imageBlob, filename = 'murajah-badge.png') => {
  try {
    const url = URL.createObjectURL(imageBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('[Murajah] Badge image downloaded');
  } catch (error) {
    console.error('[Murajah] Failed to download image:', error);
  }
};

/**
 * Generate a social media share URL
 * 
 * @param {string} platform - 'facebook', 'twitter', 'x', etc.
 * @param {Object} badgeData - Badge object containing name and backstory
 * @returns {string} Share URL
 */
export const generateShareUrl = (platform, badgeData) => {
  const baseUrl = 'https://murajah.pages.dev';
  const text = `I unlocked the "${badgeData.name}" achievement on Murajah! 🏆\n\n${badgeData.backstory}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(baseUrl);

  switch (platform.toLowerCase()) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
    case 'twitter':
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    case 'whatsapp':
      return `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    default:
      return baseUrl;
  }
};

/**
 * Load html2canvas library from CDN if not already loaded
 * This improves rendering quality for badges with complex SVGs
 * 
 * @returns {Promise<void>}
 */
export const loadHtml2Canvas = async () => {
  if (window.html2canvas) {
    return; // Already loaded
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => {
      console.log('[Murajah] html2canvas library loaded');
      resolve();
    };
    script.onerror = () => {
      console.warn('[Murajah] Failed to load html2canvas, will use fallback');
      resolve(); // Resolve anyway, we have fallback
    };
    document.head.appendChild(script);
  });
};
