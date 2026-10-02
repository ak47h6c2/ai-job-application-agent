/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        sunken: v("sunken"),
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: v("ink"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: { DEFAULT: v("accent"), strong: v("accent-strong"), soft: v("accent-soft") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
        success: { DEFAULT: v("success"), soft: v("success-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.04)",
        pop: "0 12px 32px rgb(15 23 42 / 0.14)",
      },
    },
  },
  plugins: [],
};
