import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload } from "lucide-react";

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
}

export function DropZone({ onFilesDropped, children }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

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
