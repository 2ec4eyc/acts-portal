/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
      colors: {
        fb: {
          blue: '#1877F2',
          gray: '#F0F2F5',
          border: '#E4E6EB',
          textPrimary: '#050505',
          textSecondary: '#65676B',
          hover: '#F2F2F2',
        },
      },
    },
  },
  plugins: [],
};
