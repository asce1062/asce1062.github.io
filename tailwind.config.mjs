/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        palette: {
          50: '#8e878c',
          100: '#9f94a0',
          200: '#bbb8bb',
          300: '#dcb8b0',
          400: '#e5cab7',
          500: '#9bb0cd',
          600: '#cad5db',
          700: '#120f19',
          800: '#947b82',
          900: '#201d29',
        },
        light: {
          50: '#947b82',
          100: '#ded9e3',
          200: '#c3b8c1',
          300: '#635055'
        }
      },
      fontFamily: {
        retro: ['uni0553', 'Courier New', 'monospace'],
        proto: ['0xProto', 'Courier New', 'monospace'],
      },
      fontSize: {
        // Responsive font sizes using clamp()
        'xs-responsive': 'clamp(0.625rem, 0.5rem + 0.5vw, 0.75rem)',      // 10px -> 12px
        'sm-responsive': 'clamp(0.75rem, 0.625rem + 0.5vw, 0.875rem)',    // 12px -> 14px
        'base-responsive': 'clamp(0.875rem, 0.75rem + 0.5vw, 1rem)',      // 14px -> 16px
        'lg-responsive': 'clamp(1rem, 0.875rem + 0.5vw, 1.125rem)',       // 16px -> 18px
        'xl-responsive': 'clamp(1.125rem, 1rem + 0.5vw, 1.25rem)',        // 18px -> 20px
        '2xl-responsive': 'clamp(1.25rem, 1.125rem + 0.5vw, 1.5rem)',     // 20px -> 24px
        '3xl-responsive': 'clamp(1.5rem, 1.25rem + 1vw, 1.875rem)',       // 24px -> 30px
        '4xl-responsive': 'clamp(1.875rem, 1.5rem + 1.5vw, 2.25rem)',     // 30px -> 36px
        '5xl-responsive': 'clamp(2.25rem, 1.875rem + 2vw, 3rem)',         // 36px -> 48px
        '6xl-responsive': 'clamp(3rem, 2.25rem + 3vw, 3.75rem)',          // 48px -> 60px
        '7xl-responsive': 'clamp(3.75rem, 3rem + 3vw, 4.5rem)',           // 60px -> 72px
        '8xl-responsive': 'clamp(4.5rem, 3.75rem + 4vw, 6rem)',           // 72px -> 96px
        // Special hero title size that scales more conservatively to prevent truncation
        'hero-responsive': 'clamp(2.5rem, 2rem + 2vw, 4rem)',             // 40px -> 64px
        // Special subtitle size for hero descriptions
        'subtitle-responsive': 'clamp(0.875rem, 0.75rem + 0.75vw, 1.25rem)', // 14px -> 20px
      },
      spacing: {
        // Responsive spacing using clamp()
        'xs-responsive': 'clamp(0.25rem, 0.125rem + 0.5vw, 0.5rem)',      // 4px -> 8px
        'sm-responsive': 'clamp(0.5rem, 0.25rem + 1vw, 0.75rem)',         // 8px -> 12px
        'md-responsive': 'clamp(0.75rem, 0.5rem + 1vw, 1rem)',            // 12px -> 16px
        'lg-responsive': 'clamp(1rem, 0.75rem + 1vw, 1.5rem)',            // 16px -> 24px
        'xl-responsive': 'clamp(1.5rem, 1rem + 2vw, 2rem)',               // 24px -> 32px
        '2xl-responsive': 'clamp(2rem, 1.5rem + 2vw, 3rem)',              // 32px -> 48px
        '3xl-responsive': 'clamp(3rem, 2rem + 4vw, 4rem)',                // 48px -> 64px
        '4xl-responsive': 'clamp(4rem, 3rem + 4vw, 5rem)',                // 64px -> 80px
        '5xl-responsive': 'clamp(5rem, 4rem + 5vw, 6rem)',                // 80px -> 96px
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        glow: {
          '0%': {
            'box-shadow': '0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor'
          },
          '100%': {
            'box-shadow': '0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor'
          }
        }
      },
      backdropBlur: {
        xs: '2px'
      },
      backgroundImage: {
        'topography-light': "url('/topographylight.svg')",
        'topography-dark': "url('/topography.svg')"
      }
    },
  },
  plugins: [],
}
