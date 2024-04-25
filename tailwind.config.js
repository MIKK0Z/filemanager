/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.hbs'],
  theme: {
    extend: {},
    container: {
      center: true,
      padding: '1rem',
    },
  },
  plugins: [require('daisyui')],
}

