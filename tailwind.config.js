export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'space-dark': '#0A0A1A',
        card: '#1E1E3F',
        'card-secondary': '#12122A',
        'border-space': '#2E2E5E',
        'text-space': '#E8E8FF',
        'text-muted': '#9898CC',
        accent: '#6BCB77'
      },
      borderRadius: { btn: '14px' }
    }
  },
  plugins: []
}
