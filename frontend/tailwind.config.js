/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0056A6",
          50: "#E6F0FA",
          100: "#CCE0F4",
          200: "#99C2E8",
          300: "#66A3DD",
          400: "#3385D1",
          500: "#0056A6",
          600: "#004A8F",
          700: "#003E78",
          800: "#003261",
          900: "#00264A",
        },
      },
    },
  },
  plugins: [],
};
