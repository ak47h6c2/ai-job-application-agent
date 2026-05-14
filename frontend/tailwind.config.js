/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#4F5F74",
        line: "#D7DEE8",
        panel: "#FFFFFF",
        canvas: "#F4F7FA",
        accent: "#2563EB",
        success: "#0F8A5F",
        warning: "#B7791F"
      },
      boxShadow: {
        soft: "0 14px 40px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
};
