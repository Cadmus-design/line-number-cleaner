# Line Number Cleaner

A browser-based tool to strip line numbers and clean up copied code or text.

## Features

**Code Cleaner**
- Remove line numbers in 6 formats: `1:`, `1.`, `1 |`, `[1]`, `(1)`, `1 ` (raw)
- Auto-detect pattern from pasted content
- Custom regex support
- Options: trim lines, remove blank lines, preserve indent, strip markdown fences, strip bullets
- Paste-to-clean + auto-copy workflow

**Text Purifier**
- Remove leading/trailing spaces
- Collapse multiple blank lines
- Remove mid-paragraph line breaks (useful for PDF copy-paste)
- Normalize whitespace between Chinese characters
- Strip emoji or bullet symbols

**UX**
- History — keeps last 20 operations, click to restore
- Preset examples to test each pattern
- Keyboard shortcut: Enter to clean, Shift+Enter for newline (configurable)

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

No API key required — runs entirely in the browser.

## Tech Stack

- React 19 + TypeScript
- Vite + Tailwind CSS v4
- Framer Motion (motion/react)
- Lucide icons
