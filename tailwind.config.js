/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js}",
    "./dist/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        // HIC Brand Colors (from Investor Deck theme)
        // Primary palette
        'midnight-navy': '#0B1220',      // Primary background
        'frost-white': '#F6F8FB',        // Primary text
        'cerulean-mist': '#C9DBF0',      // Accent/highlight
        'silver': '#B8C4D0',             // Secondary text
        
        // Supporting colors
        'slate-grey': '#6B7C93',         // Muted text, borders
        'pure-white': '#FFFFFF',         // High contrast text
        'pure-black': '#000000',         // High contrast on light bg
        
        // Semantic colors
        'hic-success': '#4ADE80',        // Positive (green)
        'hic-warning': '#FBBF24',        // Caution (amber)
        'hic-error': '#F87171',          // Negative/risk (red)
        'hic-info': '#60A5FA',           // Informational (blue)
      },
      fontFamily: {
        // Display/headline stack (from deck)
        headline: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        // Body/reading stack
        body: ['Inter', 'system-ui', 'sans-serif'],
        // Monospace for code/numbers
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
      backgroundColor: {
        'card': 'rgba(201, 219, 240, 0.08)',      // Subtle card background
      },
      borderColor: {
        'card': 'rgba(201, 219, 240, 0.3)',       // Card border
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
    },
  },
  plugins: [],
}
