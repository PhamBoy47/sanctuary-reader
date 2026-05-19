import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";

function copyPdfjsPublicAssets() {
  const sourceRoot = path.resolve(__dirname, "node_modules/pdfjs-dist");
  const targetRoot = path.resolve(__dirname, "public/pdfjs");

  for (const dir of ["cmaps", "standard_fonts"]) {
    fs.cpSync(path.join(sourceRoot, dir), path.join(targetRoot, dir), {
      recursive: true,
      force: true,
    });
  }
}

function pdfjsPublicAssetsPlugin() {
  return {
    name: "pdfjs-public-assets",
    buildStart: copyPdfjsPublicAssets,
    configureServer: copyPdfjsPublicAssets,
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    hmr: {
      overlay: false,
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  plugins: [react(), pdfjsPublicAssetsPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  // epubjs is no longer used. JSZip is a proper ESM-compatible package
  // and needs no special treatment here.
}));
