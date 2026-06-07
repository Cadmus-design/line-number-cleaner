# CODESTRIPPER v1.4

A browser-based tool suite for cleaning up code and text. Runs entirely client-side — no API key required.

## Features

**CLI 程式行號清除 (Code Cleaner)**
- Remove line numbers in 7 formats: `1:`, `1.`, `01 |`, `[1]`, `(1)`, `1` (raw), or custom regex
- Auto-detect pattern with confidence scoring
- Options: trim lines, remove blank lines, preserve indent, strip markdown fences, strip bullets/quotes
- Paste-to-clean + auto-copy workflow
- Configurable newline copy format: Enter / Double Enter / Shift+Enter

**AI 文本空白淨化 (Text Purifier)**
- Remove leading/trailing spaces per line
- Collapse multiple blank lines
- Remove mid-paragraph line breaks (useful for PDF copy-paste)
- Normalize whitespace between Chinese characters
- Strip emoji or bullet/quote symbols
- Configurable newline copy format

**TSV → JSON Converter**
- Paste or upload a `.tsv` / `.txt` / `.csv` file
- Converts tab-separated data to a JSON array of objects using the first row as keys
- Copy to clipboard or download as `converted.json`

**UX**
- History sidebar — keeps last 50 operations, click to restore
- Preset examples for each mode
- All processing is local — nothing leaves your browser

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

## Tech Stack

- React 19 + TypeScript
- Vite + Tailwind CSS v4
- motion/react (Framer Motion)
- Lucide icons
