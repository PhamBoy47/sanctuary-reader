import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload } from "lucide-react";

// Lazy-load Tauri APIs so web build doesn't crash
type TauriWindowModule = typeof import("@tauri-apps/api/window");
type TauriFsModule = typeof import("@tauri-apps/plugin-fs");

let tauriWindowApi: TauriWindowModule | null = null;
let tauriFsApi: TauriFsModule | null = null;

async function getTauriApis() {
  if (tauriWindowApi && tauriFsApi) return { window: tauriWindowApi, fs: tauriFsApi };
  try {
    const [win, fs] = await Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/plugin-fs")
    ]);
    tauriWindowApi = win;
    tauriFsApi = fs;
    return { window: win, fs };
  } catch {
    return null;
  }
}

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
}

export function DropZone({ onFilesDropped, children }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  // Tauri native drop handling
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    getTauriApis().then((apis) => {
      if (!apis) return;
      
      apis.window.getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragging(true);
        } else if (event.payload.type === "leave") {
          setDragging(false);
        } else if (event.payload.type === "drop") {
          setDragging(false);
          const paths = event.payload.paths;
          
          // Convert native paths to JS File objects
          Promise.all(paths.map(async (p) => {
            const bytes = await apis.fs.readFile(p);
            const name = p.split(/[\\/]/).pop() || "unknown";
            let type = "application/octet-stream";
            if (name.toLowerCase().endsWith(".pdf")) type = "application/pdf";
            if (name.toLowerCase().endsWith(".epub")) type = "application/epub+zip";
            return new File([bytes], name, { type });
          })).then((files) => {
            if (files.length > 0) onFilesDropped(files);
          }).catch(console.error);
        }
      }).then((un) => {
        unlisten = un;
      });
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [onFilesDropped]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length > 0) setDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFilesDropped(files);
  }, [onFilesDropped]);

  return (
    <div
      onDragOver={handleDrag}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDrop={handleDrop}
      className="relative min-h-screen"
    >
      {children}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-4 p-12 rounded-2xl border-2 border-dashed border-primary sanctuary-glow"
            >
              <Upload className="h-16 w-16 text-primary" />
              <p className="text-xl font-medium text-foreground">Drop files here</p>
              <p className="text-sm text-muted-foreground">.pdf, .epub</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
