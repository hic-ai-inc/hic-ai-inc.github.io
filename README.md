# HIC AI Website

Corporate website for HIC AI, Inc. — the creators of Mouse.

## Tech Stack

- **HTML**: Plain vanilla HTML (no framework)
- **CSS**: Tailwind CSS via CLI
- **Fonts**: Manrope (headlines), Inter (body)
- **Hosting**: GitHub Pages with custom domain

## Development

```bash
# Install dependencies
npm install

# Build (compiles Tailwind + copies files to dist/)
npm run build

# Watch mode for development
npm run watch
```

## Deployment

The site is automatically deployed via GitHub Pages from the `dist/` directory on the `main` branch.

### Custom Domain Setup

1. CNAME record: `hic-ai.com` → `hic-ai-inc.github.io`
2. GitHub Pages configured in repo Settings → Pages

## Structure

```
├── src/
│   ├── index.html      # Landing page
│   ├── styles/
│   │   └── main.css    # Tailwind input + components
│   ├── js/             # Client-side JS (if needed)
│   └── assets/         # Images, logos, etc.
├── dist/               # Build output (committed for Pages)
├── scripts/
│   └── build.js        # Build script
├── CNAME               # Custom domain config
└── tailwind.config.js  # Tailwind configuration
```

## Brand

Colors from the Investor Deck design system:
- **Midnight Navy**: `#0B1220` (backgrounds)
- **Frost White**: `#F6F8FB` (primary text)
- **Cerulean Mist**: `#C9DBF0` (accents/CTAs)

---

© 2026 HIC AI, Inc.
