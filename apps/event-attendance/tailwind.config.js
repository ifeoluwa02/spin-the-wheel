/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      animation: {
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-sweep": "radar 2s linear infinite",
      },
      keyframes: {
        radar: {
          "0%": { transform: "translateY(-100%)", opacity: "0.2" },
          "50%": { opacity: "1" },
          "100%": { transform: "translateY(100%)", opacity: "0.2" },
        },
      },
    },
  },
  plugins: [],
};
