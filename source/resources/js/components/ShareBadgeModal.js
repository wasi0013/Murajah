/**
 * Share Badge Modal Component
 * Displays shareable badge card with copy/download/social share options
 */

const { ref, computed, onMounted } = Vue;
import BadgeShareCardComponent from './BadgeShareCardComponent.js';
import { cardElementToBlob, copyImageToClipboard, downloadImageBlob, generateShareUrl, loadHtml2Canvas } from '../utils/badgeShareUtil.js';

export default {
  components: {
    BadgeShareCardComponent
  },

  template: `
    <div v-if="badge" class="fixed inset-0 bg-black/50 dark:bg-black/70 
                            flex items-center justify-center z-50 p-4 transition-opacity"
         @click.self="closeModal">
      <div class="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[95vh] 
                  overflow-y-auto shadow-2xl transform transition-all">
        
        <!-- Header -->
        <div class="sticky top-0 flex items-center justify-between p-6 border-b dark:border-gray-700 
                    bg-gradient-to-r from-amber-50 dark:from-gray-700 to-orange-50 dark:to-gray-700">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            Share Achievement
          </h2>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 
                                          transition-colors p-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="p-6 space-y-6">
          <!-- Preview Section -->
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Preview
            </h3>
            
            <!-- Card Preview Container -->
            <div class="flex justify-center bg-gradient-to-br from-gray-100 to-gray-200 
                        dark:from-gray-700 dark:to-gray-900 p-6 rounded-xl overflow-auto">
              <div class="scale-75 origin-top">
                <BadgeShareCardComponent :badge="badge" />
              </div>
            </div>
          </div>

          <!-- Actions Section -->
          <div class="border-t dark:border-gray-700 pt-6 space-y-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Share Options
            </h3>

            <!-- Primary Actions -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Copy to Clipboard -->
              <button @click="handleCopyToClipboard" 
                      :disabled="isCopying"
                      class="flex items-center justify-center gap-2 
                             bg-gradient-to-r from-blue-500 to-blue-600 
                             hover:from-blue-600 hover:to-blue-700 
                             disabled:from-gray-400 disabled:to-gray-500
                             text-white font-bold py-3 px-4 rounded-lg 
                             transition-all shadow-md hover:shadow-lg">
                <svg v-if="!isCopying" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                <svg v-else class="w-5 h-5 animate-spin" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3"/>
                  <path d="M12 4.75v2.5" fill="currentColor"/>
                  <path d="M12 16.75v2.5" fill="currentColor"/>
                  <path d="M4.75 12h2.5" fill="currentColor"/>
                  <path d="M16.75 12h2.5" fill="currentColor"/>
                </svg>
                <span>{{ isCopying ? 'Copying...' : 'Copy to Clipboard' }}</span>
              </button>

              <!-- Download PNG -->
              <button @click="handleDownloadPNG" 
                      :disabled="isGenerating"
                      class="flex items-center justify-center gap-2 
                             bg-gradient-to-r from-green-500 to-green-600 
                             hover:from-green-600 hover:to-green-700
                             disabled:from-gray-400 disabled:to-gray-500
                             text-white font-bold py-3 px-4 rounded-lg 
                             transition-all shadow-md hover:shadow-lg">
                <svg v-if="!isGenerating" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <svg v-else class="w-5 h-5 animate-spin" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3"/>
                </svg>
                <span>{{ isGenerating ? 'Generating...' : 'Download PNG' }}</span>
              </button>
            </div>

            <!-- Social Share Links -->
            <div class="space-y-3">
              <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Share on Social Media
              </p>
              
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <!-- Facebook -->
                <button @click="handleSocialShare('facebook')" 
                        :disabled="isGenerating"
                        class="flex items-center justify-center gap-2 
                               bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                               text-white font-bold py-2 px-3 rounded-lg transition-all text-sm">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>Facebook</span>
                </button>

                <!-- Twitter/X -->
                <button @click="handleSocialShare('twitter')" 
                        :disabled="isGenerating"
                        class="flex items-center justify-center gap-2 
                               bg-black hover:bg-gray-800 disabled:bg-gray-400
                               text-white font-bold py-2 px-3 rounded-lg transition-all text-sm">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.6l-5.165-6.755L2.306 21.75H-0.012l7.644-8.746L0 2.25h6.782l4.696 6.207L17.856 2.25h.388zm-1.17 19.54h1.833L5.864 4.122H3.914L17.074 21.79z"/>
                  </svg>
                  <span>X</span>
                </button>

                <!-- WhatsApp -->
                <button @click="handleSocialShare('whatsapp')" 
                        :disabled="isGenerating"
                        class="flex items-center justify-center gap-2 
                               bg-green-500 hover:bg-green-600 disabled:bg-gray-400
                               text-white font-bold py-2 px-3 rounded-lg transition-all text-sm">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-5.031 1.378c-1.4.821-2.663 1.998-3.606 3.355C2.359 11.905 1.5 14.079 1.5 16.331c0 2.805.856 5.451 2.413 7.611l-1.746 6.375 6.814-1.305c2.253 1.273 4.786 1.972 7.422 1.972 2.807 0 5.455-.856 7.611-2.413 1.400-.82 2.663-1.998 3.606-3.355 1.945-2.716 2.804-5.89 2.804-9.143 0-2.806-.856-5.451-2.413-7.611-1.4-.821-2.663-1.999-3.606-3.356-1.945-2.715-2.804-5.89-2.804-9.142 0-2.806.856-5.451 2.413-7.611 1.4-.82 2.663-1.998 3.606-3.355 1.945-2.716 2.804-5.89 2.804-9.143z"/>
                  </svg>
                  <span>WhatsApp</span>
                </button>

                <!-- LinkedIn -->
                <button @click="handleSocialShare('linkedin')" 
                        :disabled="isGenerating"
                        class="flex items-center justify-center gap-2 
                               bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400
                               text-white font-bold py-2 px-3 rounded-lg transition-all text-sm">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.475-2.236-1.986-2.236-1.081 0-1.722.722-2.006 1.419-.103.249-.129.597-.129.946v5.44h-3.553s.048-8.733 0-9.65h3.553v1.367c.428-.659 1.191-1.598 2.897-1.598 2.117 0 3.704 1.384 3.704 4.362v5.519zM5.337 9.431c-1.144 0-1.915-.758-1.915-1.704 0-.951.77-1.704 1.963-1.704 1.192 0 1.914.753 1.938 1.704 0 .946-.746 1.704-1.986 1.704zm1.582 11.021H3.656v-9.65h3.263v9.65zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span>LinkedIn</span>
                </button>
              </div>
            </div>

            <!-- Status Messages -->
            <div v-if="statusMessage" class="p-3 rounded-lg"
                 :class="statusMessage.type === 'success' 
                   ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' 
                   : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'">
              {{ statusMessage.text }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  props: {
    badge: {
      type: Object,
      required: true
    }
  },

  emits: ['close'],

  setup(props, { emit }) {
    const isGenerating = ref(false);
    const isCopying = ref(false);
    const statusMessage = ref(null);

    const closeModal = () => {
      emit('close');
    };

    const showMessage = (text, type = 'success', duration = 3000) => {
      statusMessage.value = { text, type };
      if (duration > 0) {
        setTimeout(() => {
          statusMessage.value = null;
        }, duration);
      }
    };

    const handleCopyToClipboard = async () => {
      isCopying.value = true;
      try {
        // Load html2canvas for better rendering
        await loadHtml2Canvas();

        // Generate the card element
        const cardContainer = document.createElement('div');
        cardContainer.style.position = 'fixed';
        cardContainer.style.left = '-9999px';
        cardContainer.style.top = '-9999px';
        
        // Import and create the card component dynamically
        const { createApp } = Vue;
        const app = createApp({
          components: { BadgeShareCardComponent },
          template: '<BadgeShareCardComponent ref="cardComponent" :badge="badge" />',
          setup() {
            const cardComponent = ref(null);
            return { badge: props.badge, cardComponent };
          }
        });

        app.mount(cardContainer);
        document.body.appendChild(cardContainer);

        // Wait for component to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // Find the actual card div - look for the one with 400px dimensions
        let cardElement = cardContainer.querySelector('div[style*="width: 400px"]');
        if (!cardElement) {
          // Fallback: find any div with width 400 in styles
          cardElement = Array.from(cardContainer.querySelectorAll('div')).find(el => {
            const styles = el.getAttribute('style');
            return styles && styles.includes('400px') && styles.includes('height: 400px');
          });
        }
        if (!cardElement) {
          // Last resort: get the main div child
          cardElement = cardContainer.querySelector('div > div');
        }
        
        const imageBlob = await cardElementToBlob(cardElement, 2);

        const success = await copyImageToClipboard(imageBlob);
        
        if (success) {
          showMessage('✓ Badge card copied to clipboard!', 'success');
        } else {
          showMessage('Clipboard API not supported. Please download the image instead.', 'error', 5000);
        }

        // Cleanup
        app.unmount();
        document.body.removeChild(cardContainer);
      } catch (error) {
        console.error('[Murajah] Error copying to clipboard:', error);
        showMessage(`Failed to copy: ${error.message}`, 'error', 5000);
      } finally {
        isCopying.value = false;
      }
    };

    const handleDownloadPNG = async () => {
      isGenerating.value = true;
      try {
        // Load html2canvas for better rendering
        await loadHtml2Canvas();

        // Generate the card element
        const cardContainer = document.createElement('div');
        cardContainer.style.position = 'fixed';
        cardContainer.style.left = '-9999px';
        cardContainer.style.top = '-9999px';
        
        // Import and create the card component dynamically
        const { createApp } = Vue;
        const app = createApp({
          components: { BadgeShareCardComponent },
          template: '<BadgeShareCardComponent :badge="badge" />',
          setup() {
            return { badge: props.badge };
          }
        });

        app.mount(cardContainer);
        document.body.appendChild(cardContainer);

        // Wait for component to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // Find the actual card div - look for the one with 400px dimensions
        let cardElement = cardContainer.querySelector('div[style*="width: 400px"]');
        if (!cardElement) {
          // Fallback: find any div with width 400 in styles
          cardElement = Array.from(cardContainer.querySelectorAll('div')).find(el => {
            const styles = el.getAttribute('style');
            return styles && styles.includes('400px') && styles.includes('height: 400px');
          });
        }
        if (!cardElement) {
          // Last resort: get the main div child
          cardElement = cardContainer.querySelector('div > div');
        }
        
        const imageBlob = await cardElementToBlob(cardElement, 2);

        const filename = `murajah-${props.badge.name.replace(/\s+/g, '-').toLowerCase()}-badge.png`;
        downloadImageBlob(imageBlob, filename);

        showMessage('✓ Badge image downloaded!', 'success');

        // Cleanup
        app.unmount();
        document.body.removeChild(cardContainer);
      } catch (error) {
        console.error('[Murajah] Error downloading image:', error);
        showMessage(`Failed to generate image: ${error.message}`, 'error', 5000);
      } finally {
        isGenerating.value = false;
      }
    };

    onMounted(async () => {
      // Pre-load html2canvas library in the background
      await loadHtml2Canvas();
    });

    const handleSocialShare = async (platform) => {
      isGenerating.value = true;
      try {
        // Load html2canvas for better rendering
        await loadHtml2Canvas();

        // Generate the card element
        const cardContainer = document.createElement('div');
        cardContainer.style.position = 'fixed';
        cardContainer.style.left = '-9999px';
        cardContainer.style.top = '-9999px';
        
        // Import and create the card component dynamically
        const { createApp } = Vue;
        const app = createApp({
          components: { BadgeShareCardComponent },
          template: '<BadgeShareCardComponent :badge="badge" />',
          setup() {
            return { badge: props.badge };
          }
        });

        app.mount(cardContainer);
        document.body.appendChild(cardContainer);

        // Wait for component to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // Find the actual card div - look for the one with 400px dimensions
        let cardElement = cardContainer.querySelector('div[style*="width: 400px"]');
        if (!cardElement) {
          // Fallback: find any div with width 400 in styles
          cardElement = Array.from(cardContainer.querySelectorAll('div')).find(el => {
            const styles = el.getAttribute('style');
            return styles && styles.includes('400px') && styles.includes('height: 400px');
          });
        }
        if (!cardElement) {
          // Last resort: get the main div child
          cardElement = cardContainer.querySelector('div > div');
        }
        
        const imageBlob = await cardElementToBlob(cardElement, 2);

        // For social media, we'll open the share URL with text
        // Note: Most social platforms don't support pre-attaching images via URL
        // Users will need to attach the image manually or copy it first
        const shareUrl = generateShareUrl(platform, props.badge);
        
        // Open social platform share in new window
        window.open(shareUrl, '_blank', 'width=600,height=400');
        
        // Also try to copy the image to clipboard
        const copiedSuccess = await copyImageToClipboard(imageBlob);
        
        if (copiedSuccess) {
          showMessage(`✓ Opened ${platform}! Badge image also copied to clipboard - paste it in your post.`, 'success', 5000);
        } else {
          showMessage(`✓ Opened ${platform}! Tip: Download the badge image and attach it manually.`, 'success', 5000);
        }

        // Cleanup
        app.unmount();
        document.body.removeChild(cardContainer);
      } catch (error) {
        console.error(`[Murajah] Error sharing to ${platform}:`, error);
        showMessage(`Failed to share to ${platform}: ${error.message}`, 'error', 5000);
      } finally {
        isGenerating.value = false;
      }
    };

    return {
      closeModal,
      handleCopyToClipboard,
      handleDownloadPNG,
      handleSocialShare,
      isGenerating,
      isCopying,
      statusMessage,
      generateShareUrl
    };
  }
};
