/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F1E6',
        card: '#FFFDF9',
        rust: '#B5502E',
        rustDark: '#8C3C22',
        ink: '#241D16',
        muted: '#8A7F71',
        pill: '#EFE4D3',
        line: '#E6DAC7'
      },
      fontFamily: {
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};
