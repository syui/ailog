/**
 * Theme and visual effects - Pure CSS animations, no jQuery
 */
class Theme {
    constructor() {
        this.init();
    }

    init() {
        this.setupParticleColors();
        this.setupLogoAnimations();
    }

    setupParticleColors() {
        // Dynamic particle colors based on theme
        const style = document.createElement('style');
        style.textContent = `
            /* Dynamic particle colors based on theme */
            .likeButton .particleLayer circle:nth-child(1),
            .likeButton .particleLayer circle:nth-child(2) {
                fill: var(--particle-color-1) !important;
            }
            
            .likeButton .particleLayer circle:nth-child(3),
            .likeButton .particleLayer circle:nth-child(4) {
                fill: var(--particle-color-2) !important;
            }
            
            .likeButton .particleLayer circle:nth-child(5),
            .likeButton .particleLayer circle:nth-child(6),
            .likeButton .particleLayer circle:nth-child(7) {
                fill: var(--particle-color-3) !important;
            }
            
            .likeButton .particleLayer circle:nth-child(8),
            .likeButton .particleLayer circle:nth-child(9),
            .likeButton .particleLayer circle:nth-child(10) {
                fill: var(--particle-color-4) !important;
            }
            
            .likeButton .particleLayer circle:nth-child(11),
            .likeButton .particleLayer circle:nth-child(12),
            .likeButton .particleLayer circle:nth-child(13),
            .likeButton .particleLayer circle:nth-child(14) {
                fill: var(--particle-color-5) !important;
            }
            
            /* Reset initial animations but allow hover */
            .likeButton .syui {
                animation: none;
            }
            
            .likeButton .particleLayer {
                animation: none; 
            }
            
            .likeButton .explosion {
                animation: none;
            }
            
            /* Enable hover animations from package */
            .likeButton:hover .syui,
            .likeButton:hover path.syui {
                animation: syuiDeluxeAnime 400ms forwards !important;
            }
            
            .likeButton:hover .particleLayer {
                animation: particleLayerAnime 800ms forwards !important;
            }
            
            .likeButton:hover .explosion {
                animation: explosionAnime 800ms forwards !important;
            }
            
            /* Logo positioning */
            .logo .likeButton {
                background: transparent !important;
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    setupLogoAnimations() {
        // Pure CSS animations are handled by the svg-animation-package.css
        // This method is reserved for any future JavaScript-based enhancements
        console.log('Logo animations initialized (CSS-based)');
    }
}

// Initialize theme when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Theme();
});