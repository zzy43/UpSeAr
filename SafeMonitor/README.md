# � Vanilla CardSlider - Customizable Content Showcase

A highly customizable, responsive card carousel with Material Design controls. Perfect for showcasing movies, products, portfolios, or any visual content with pure vanilla JavaScript.

<img width="1914" height="914" alt="vanilla-cardSlider" src="https://github.com/user-attachments/assets/4b5fb081-1692-4a2e-ad2f-100adb4cf1a3" />

#Demo - https://syntaxsidekick.github.io/vanilla-cardSlider/

## 🚀 Quick Start

1. **No installation required** - Pure HTML, CSS, JavaScript
2. **Include the files:**
   ```html
   <!-- Load configuration first -->
   <script src="config.js"></script>
   <script src="scripts.js"></script>
   <link rel="stylesheet" href="styles.css">
   ```

3. **Add the HTML structure** (copy from `index.html`)

4. **Customize your content** in `config.js`:
   ```javascript
   window.SLIDE_DATA = [
     {
       genre: 'Your Category',
       titleTop: 'TITLE',
       titleBottom: 'LINE TWO',
       synopsis: 'Your description here...',
       poster: 'path/to/your/image.jpg'
     }
   ];
   ```

5. **Open in browser** - No server required!

## 📁 File Structure

```
vanilla-cardslider/
├── index.html          # Main CardSlider demo
├── example-custom.html # Product showcase example
├── config.js          # Configuration system
├── scripts.js         # Core CardSlider logic
├── styles.css         # Styling and animations
└── README.md          # This documentation
```

## ⚙️ Configuration Options

### Data Configuration

Replace `window.SLIDE_DATA` with your content:

```javascript
window.SLIDE_DATA = [
  {
    genre: 'Content Category',     // Top label text
    titleTop: 'MAIN',             // First title line
    titleBottom: 'TITLE',         // Second title line  
    synopsis: 'Description...',   // Main content description
    poster: 'image-url.jpg'       // Background image URL
  }
];
```

### Layout & Timing

```javascript
window.CAROUSEL_CONFIG = {
  // Thumbnail settings
  THUMB_WIDTH: 200,              // Thumbnail width (px)
  THUMB_HEIGHT: 300,             // Thumbnail height (px)
  THUMB_SPACING: 40,             // Space between thumbnails
  MAX_VISIBLE_THUMBS: 4,         // Max thumbnails to show
  
  // Positioning
  THUMB_AREA_RIGHT: 900,         // Distance from right edge
  THUMB_AREA_BOTTOM: 500,        // Distance from bottom
  MIN_AREA_OFFSET: 300,          // Minimum offset from edges
  
  // Animation timing (milliseconds)
  ANIMATION_DURATION: 600,       // Slide transition speed
  TEXT_SWITCH_DELAY: 320,        // Text content switch delay
  AUTO_PLAY_INTERVAL: 5000,      // Auto-advance timing
  
  // Features
  AUTO_PLAY_ENABLED: true,       // Start with auto-play
  KEYBOARD_ENABLED: true,        // Arrow key navigation
  DEBUG_LOGGING: false           // Console debugging
};
```

### Appearance

```javascript
window.APPEARANCE_CONFIG = {
  // Colors
  PRIMARY_COLOR: '#2196F3',      // Material blue
  ACCENT_COLOR: '#FF5722',       // Material orange
  BACKGROUND_COLOR: '#121212',   // Dark background
  TEXT_COLOR: '#ffffff',         // Primary text
  
  // Typography
  TITLE_FONT_SIZE: '4rem',       // Main title size
  GENRE_FONT_SIZE: '1.1rem',     // Category text size
  SYNOPSIS_FONT_SIZE: '1rem',    // Description text size
  
  // Effects
  TEXT_SHADOW: '...',            // Text shadow for visibility
  BORDER_RADIUS: '8px'           // Corner rounding
};
```

### Responsive Breakpoints

```javascript
window.RESPONSIVE_CONFIG = {
  MOBILE_MAX: 768,               // Mobile breakpoint
  TABLET_MAX: 1024,              // Tablet breakpoint
  
  // Mobile adjustments
  MOBILE_THUMB_WIDTH: 120,       // Smaller thumbnails
  MOBILE_MAX_THUMBS: 3,          // Fewer visible thumbs
  MOBILE_TITLE_SIZE: '2.5rem'    // Smaller titles
};
```

## 🎨 Quick Setup Functions

Use the built-in helpers for common configurations:

```javascript
// Product showcase
CAROUSEL_QUICK_SETUP
  .setColors('#4CAF50', '#FF9800', '#fafafa')
  .setTiming('slow')
  .disableAutoPlay();

// Portfolio gallery
CAROUSEL_QUICK_SETUP
  .setColors('#9C27B0', '#E91E63')
  .setTiming('normal');

// News carousel
CAROUSEL_QUICK_SETUP
  .setColors('#607D8B', '#FF5722')
  .setTiming('fast');
```

## 📱 Responsive Design

The carousel automatically adapts to different screen sizes:

- **Desktop**: Full thumbnails and controls
- **Tablet**: Reduced thumbnails, optimized spacing
- **Mobile**: Minimal thumbnails, touch-friendly controls

## 🎯 Use Cases

### Movie/TV Showcase
```javascript
// Perfect for entertainment content
window.SLIDE_DATA = [
  {
    genre: 'Sci-Fi Action',
    titleTop: 'BLADE',
    titleBottom: 'RUNNER 2049',
    synopsis: 'Thirty years after the events...',
    poster: 'movie-poster-url.jpg'
  }
];
```

### Product Catalog
```javascript
// Great for e-commerce
window.SLIDE_DATA = [
  {
    genre: 'Premium Laptop',
    titleTop: 'MACBOOK',
    titleBottom: 'PRO M3',
    synopsis: 'Experience unprecedented performance...',
    poster: 'product-image-url.jpg'
  }
];
```

### Portfolio Showcase
```javascript
// Perfect for creative work
window.SLIDE_DATA = [
  {
    genre: 'Web Design',
    titleTop: 'CREATIVE',
    titleBottom: 'AGENCY',
    synopsis: 'Modern web design for forward-thinking brands...',
    poster: 'portfolio-screenshot.jpg'
  }
];
```

### News/Articles
```javascript
// Great for content sites
window.SLIDE_DATA = [
  {
    genre: 'Breaking News',
    titleTop: 'MARKET',
    titleBottom: 'UPDATE',
    synopsis: 'Latest developments in global markets...',
    poster: 'news-image.jpg'
  }
];
```

## 🎮 Controls & Features

### Material Design Controls
- **Play/Pause**: Auto-play toggle with animation
- **Navigation**: Previous/next slide buttons
- **Progress**: Visual progress indicator
- **Counter**: Current slide position

### Keyboard Navigation
- `←` Previous slide
- `→` Next slide
- `Space` Pause/resume auto-play

### Accessibility Features
- ARIA labels and live regions
- Screen reader announcements
- Keyboard navigation support
- Focus management

## 🛠️ Customization Examples

### Corporate Website
```javascript
window.CAROUSEL_QUICK_SETUP
  .setColors('#1565C0', '#FFC107', '#f5f5f5')
  .setTiming('slow')
  .enableDebug();
```

### Gaming Site
```javascript
window.CAROUSEL_CONFIG.ANIMATION_DURATION = 400;
window.CAROUSEL_CONFIG.AUTO_PLAY_INTERVAL = 3000;
window.APPEARANCE_CONFIG.PRIMARY_COLOR = '#FF6F00';
window.APPEARANCE_CONFIG.ACCENT_COLOR = '#D32F2F';
```

### Minimalist Portfolio
```javascript
window.APPEARANCE_CONFIG.BACKGROUND_COLOR = '#ffffff';
window.APPEARANCE_CONFIG.TEXT_COLOR = '#212121';
window.CAROUSEL_CONFIG.AUTO_PLAY_ENABLED = false;
```

## 📦 Installation

1. **Download** all files to your project directory
2. **No build process** - works immediately  
3. **Include** the HTML structure in your page
4. **Customize** the configuration in `config.js`
5. **Replace** the demo data with your content
6. **Open in browser** - ready to go!

## 🔧 Advanced Customization

### Custom CSS Variables
Add to your CSS for dynamic theming:
```css
:root {
  --carousel-primary: #2196F3;
  --carousel-accent: #FF5722;
  --carousel-background: #121212;
}
```

### Custom Animation Timing
```javascript
window.CAROUSEL_CONFIG.STAGGER_DELAY = 0.2;  // Slower thumbnail stagger
window.CAROUSEL_CONFIG.TEXT_HIDE_DELAY = 400; // Longer text transition
```

### Image Loading Optimization
The carousel includes automatic image preloading and lazy loading for optimal performance.

## 📄 License

This carousel is provided as-is for customization and use in your projects. Feel free to modify and adapt to your needs.

## 🆘 Support

For customization help or questions:
1. Check the configuration options above
2. Review the example files
3. Enable debug logging: `CAROUSEL_CONFIG.DEBUG_LOGGING = true`

---

**Ready to showcase your content?** Start with `example-custom.html` and customize from there! 🎉

## 👨‍💻 Created By

**Riad Kilani** (@SyntaxSidekick)

- 🌐 **Portfolio:** [riadkilani.com](https://riadkilani.com)
- 🐙 **GitHub:** [github.com/SyntaxSidekick](https://github.com/SyntaxSidekick)
- 🖊️ **CodePen:** [codepen.io/SyntaxSidekick](https://codepen.io/SyntaxSidekick)
- 🐦 **X.com:** [@syntaxsidekick](https://x.com/syntaxsidekick)
- 💼 **LinkedIn:** [linkedin.com/in/riad-kilani](https://linkedin.com/in/riad-kilani)

---

*Built with ❤️ and vanilla JavaScript. No frameworks, just pure performance.*
