/**
 * Image Comparison Slider
 * UE5-style before/after image comparison component
 */

class ImageComparison {
    constructor(container) {
        this.container = container;
        this.slider = container.querySelector('.slider');
        this.beforeImg = container.querySelector('.img-before');
        this.afterImg = container.querySelector('.img-after');
        this.sliderThumb = container.querySelector('.slider-thumb');
        
        this.isDragging = false;
        this.containerRect = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.updatePosition(50); // Start at 50%
    }
    
    bindEvents() {
        // Mouse events
        this.slider.addEventListener('input', (e) => {
            this.updatePosition(e.target.value);
        });
        
        this.slider.addEventListener('mousedown', () => {
            this.isDragging = true;
            document.body.style.userSelect = 'none';
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                document.body.style.userSelect = '';
            }
        });
        
        // Touch events for mobile
        this.slider.addEventListener('touchstart', (e) => {
            this.isDragging = true;
            e.preventDefault();
        });
        
        this.slider.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                const touch = e.touches[0];
                this.containerRect = this.container.getBoundingClientRect();
                const x = touch.clientX - this.containerRect.left;
                const percentage = Math.max(0, Math.min(100, (x / this.containerRect.width) * 100));
                this.slider.value = percentage;
                this.updatePosition(percentage);
                e.preventDefault();
            }
        });
        
        this.slider.addEventListener('touchend', () => {
            this.isDragging = false;
        });
        
        // Direct click on container
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container || e.target.classList.contains('img-comparison-slider')) {
                this.containerRect = this.container.getBoundingClientRect();
                const x = e.clientX - this.containerRect.left;
                const percentage = Math.max(0, Math.min(100, (x / this.containerRect.width) * 100));
                this.slider.value = percentage;
                this.updatePosition(percentage);
            }
        });
        
        // Keyboard support
        this.slider.addEventListener('keydown', (e) => {
            let value = parseFloat(this.slider.value);
            switch (e.key) {
                case 'ArrowLeft':
                    value = Math.max(0, value - 1);
                    break;
                case 'ArrowRight':
                    value = Math.min(100, value + 1);
                    break;
                case 'Home':
                    value = 0;
                    break;
                case 'End':
                    value = 100;
                    break;
                default:
                    return;
            }
            e.preventDefault();
            this.slider.value = value;
            this.updatePosition(value);
        });
    }
    
    updatePosition(percentage) {
        const position = parseFloat(percentage);
        
        // Update clip-path for before image to show only the left portion
        this.beforeImg.style.clipPath = `inset(0 ${100 - position}% 0 0)`;
        
        // Update slider thumb position
        this.sliderThumb.style.left = `${position}%`;
        this.sliderThumb.style.transform = `translateX(-50%)`;
        
    }
}

// Auto-initialize all image comparison components
document.addEventListener('DOMContentLoaded', function() {
    const comparisons = document.querySelectorAll('.img-comparison-container');
    comparisons.forEach(container => {
        new ImageComparison(container);
    });
});

// Export for manual initialization
window.ImageComparison = ImageComparison;