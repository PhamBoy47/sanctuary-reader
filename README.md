# Sanctuary Reader

A modern, high-performance web-based reader for both PDF and EPUB documents. Built with React and TypeScript, Sanctuary Reader provides a professional reading environment with a focus on stability, clarity, and ease of use.

## ✨ Features

- **Multi-Format Support:** Seamlessly read both **PDF** and **EPUB** files within the same application.
- **GodMode Stability:** A highly optimized PDF rendering engine ensuring zero-bug scrolling and text selection.
- **Customizable Viewing:** Switch between single-page, continuous, and two-page (PDF) layouts.
- **Advanced Tools:**
  - Full-text search with live highlighting.
  - Interactive Table of Contents (TOC).
  - Annotations: Highlights and Symbols 
  - Save progress and bookmarks directly in your browser.
- **Theme & Appearance:** Toggle between distinct UI themes, adjust font sizes, and utilize the clean, glass-morphic UI.
- **Privacy First:** 100% local processing. No documents are uploaded to any server.

## 🚀 Getting Started

### Prerequisites

Ensure you have Node.js (version 18 or above) installed on your machine.

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/sanctuary-reader.md.git
   cd sanctuary-reader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to the local server URL provided in the terminal (usually `http://localhost:5173` or `http://localhost:8080`).

## 🛠️ Tech Stack

- **Framework:** React 18 with TypeScript
- **Styling:** Tailwind CSS + Radix UI Primitives (via shadcn/ui)
- **PDF Engine:** pdfjs-dist
- **EPUB Parser:** JSZip (zero-dependency iframe rendering)
- **State Management:** React Hooks & LocalStorage
- **Build Tool:** Vite

## ⌨️ Keyboard Shortcuts

Sanctuary Reader is fully optimized for keyboard navigation. Press `?` (or find the keyboard icon in the toolbar) while using the app to view the complete list of shortcuts, including:
- Page Navigation (`Arrow Keys`, `Space`, `PageDown`)
- Display Mode Toggles (`d`)
- Fullscreen and Auto-fit (`Ctrl + L`, `Ctrl + \`)
- Search (`Ctrl + F`)

## 📄 License

This project is open-source. Feel free to use, modify, and distribute it as needed.
