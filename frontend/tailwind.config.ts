import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:  '#fafaf9',
        surface: '#ffffff',
        hair:    '#e8e6e5',
        mutedbg: '#f5f5f4',
        ink:     '#0c0a09',
        soot:    '#1c1917',
        sec:     '#78716c',   // chữ phụ; KHÔNG dùng #a8a29e cho chữ nội dung
        cyan:      '#3ba6f1',
        cyanEdge:  '#3398e1',
        sky:       '#c1e1f7',
        danger:    '#b91c1c', dangerBg:  '#fef2f2',
        success:   '#15803d', successBg: '#f0fdf4',
        warning:   '#b45309', warningBg: '#fffbeb',
        warningEdge: '#f59e0b', // F3: viền .b-warn / .cell.warn trong tokens.css, brief bỏ sót
        draft:     '#57534e',
      },
      borderRadius: { tile: '10px', input: '6px' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      fontSize: {
        table:     ['13px', '1.35'],
        tableHead: ['12px', '1.2'],
        kpi:       ['40px', '1.1'],
        pageTitle: ['24px', '1.25'],
      },
    },
  },
  plugins: [],
} satisfies Config
