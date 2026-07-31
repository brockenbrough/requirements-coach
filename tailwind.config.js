/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Namespaced under `brand` so it never collides with Tailwind's
        // own default palette (e.g. bg-purple-500). Values point at the
        // CSS custom properties defined in app/globals.css, which is the
        // single source of truth for the app's colors.
        brand: {
          navy: 'var(--rc-navy)',
          'navy-2': 'var(--rc-navy-2)',
          'navy-border': 'var(--rc-navy-border)',
          void: 'var(--rc-void)',
          purple: 'var(--rc-purple)',
          'purple-dark': 'var(--rc-purple-dark)',
          'purple-glow': 'var(--rc-purple-glow)',
          teal: 'var(--rc-teal)',
          'teal-dark': 'var(--rc-teal-dark)',
          'teal-ink': 'var(--rc-teal-ink)',
          gold: 'var(--rc-gold)',
          danger: 'var(--rc-danger)',
          'danger-light': 'var(--rc-danger-light)',
          ink: 'var(--rc-text)',
          'ink-muted': 'var(--rc-text-muted)',
        },
      },
      borderRadius: {
        'brand-sm': '9px',
        'brand-md': '10px',
        'brand-lg': '20px',
      },
    },
  },
  plugins: [],
};
