import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, BookOpenCheck, FolderOpen, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileCard } from "@/components/FileCard";
import { DropZone } from "@/components/DropZone";
import { PdfViewer } from "@/viewers/PdfViewer";
import { EpubViewer } from "@/viewers/EpubViewer";

import {
  FileEntry, getFiles, saveFile, deleteFile,
  detectFileType, generateId,
} from "@/lib/fileStore";

export default function Index() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [search, setSearch] = useState("");
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    const all = await getFiles();
    setFiles(all.sort((a, b) => b.lastOpened - a.lastOpened));
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const importFiles = useCallback(async (fileList: File[]) => {
    let firstAddedFile: FileEntry | null = null;
    for (const f of fileList) {
      const type = detectFileType(f.name);
      if (!type) continue;
      const data = await f.arrayBuffer();
      const entry: FileEntry = {
        id: generateId(),
        name: f.name,
        type,
        size: f.size,
        lastOpened: Date.now(),
        progress: 0,
        data,
      };
      await saveFile(entry);
      if (!firstAddedFile) firstAddedFile = entry;
    }
    await loadFiles();
    if (firstAddedFile) {
      setActiveFile(firstAddedFile);
    }
  }, [loadFiles]);

  const handleOpen = useCallback((file: FileEntry) => {
    setActiveFile(file);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFile(id);
    loadFiles();
  }, [loadFiles]);

  const handleBack = useCallback(() => {
    setActiveFile(null);
    loadFiles();
  }, [loadFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) importFiles(Array.from(e.target.files));
  }, [importFiles]);

  // Viewer routing
  if (activeFile) {
    switch (activeFile.type) {
      case "pdf":
        return <PdfViewer file={activeFile} onBack={handleBack} />;
      case "epub":
        return <EpubViewer file={activeFile} onBack={handleBack} />;

    }
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DropZone onFilesDropped={importFiles}>
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 glass-surface">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
            <div className="flex items-center gap-3">
              <BookOpenCheck className="h-7 w-7 text-primary" />
              <h1 className="text-xl font-semibold text-foreground tracking-tight">
                Sanctuary <span className="text-primary">Reader</span>
              </h1>
            </div>
            <div className="flex-1 max-w-md ml-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your library…"
                  className="pl-9 bg-secondary border-border"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="ghost" size="icon"
                onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              >
                {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.epub"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <Button onClick={() => inputRef.current?.click()} className="gap-2">
                <Plus className="h-4 w-4" />
                Open Doc
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {files.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 gap-6"
            >
              <div className="p-6 rounded-full bg-muted sanctuary-glow">
                <FolderOpen className="h-12 w-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">Your sanctuary awaits</h2>
                <p className="text-muted-foreground max-w-md">
                  Drag & drop your files here, or click Open Doc to add PDFs & EPUBs.
                  Everything stays on your device.
                </p>
              </div>
              <Button onClick={() => inputRef.current?.click()} size="lg" className="gap-2 mt-2">
                <Plus className="h-5 w-5" />
                Open Doc
              </Button>
            </motion.div>
          ) : (
            <>
              {filtered.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {search ? `Results for "${search}"` : "Recent"}
                  </h2>
                </div>
              )}
              <AnimatePresence mode="wait">
                {viewMode === "grid" ? (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5"
                  >
                    {filtered.map((f) => (
                      <FileCard key={f.id} file={f} onOpen={handleOpen} onDelete={handleDelete} />
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2"
                  >
                    {filtered.map((f) => (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/30 cursor-pointer transition-colors"
                        onClick={() => handleOpen(f)}
                      >
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {f.type}
                        </span>
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{f.name}</span>
                        <div className="w-20 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${f.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{f.progress}%</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {filtered.length === 0 && search && (
                <p className="text-center text-muted-foreground py-16">No files matching "{search}"</p>
              )}
            </>
          )}
        </main>
      </div>
    </DropZone>
  );
}
