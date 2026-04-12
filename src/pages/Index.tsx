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
import { extractEpubCover } from "@/lib/epubThumb";
import { useAppSettings } from "@/lib/appSettings";
import { AppSettingsDialog } from "@/components/AppSettingsDialog";

export default function Index() {
  const { settings } = useAppSettings();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [search, setSearch] = useState("");
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    const all = await getFiles();
    const sorted = [...all].sort((a, b) => {
      switch (settings.sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'size': return b.size - a.size;
        case 'progress': return b.progress - a.progress;
        default: return b.lastOpened - a.lastOpened;
      }
    });
    setFiles(sorted);
  }, [settings.sortBy]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const importFiles = useCallback(async (fileList: File[]) => {
    let firstAddedFile: FileEntry | null = null;
    for (const f of fileList) {
      const type = detectFileType(f.name);
      if (!type) continue;
      const data = await f.arrayBuffer();
      
      let coverUrl: string | undefined;
      if (type === 'epub') {
        coverUrl = await extractEpubCover(data) || undefined;
      }

      const entry: FileEntry = {
        id: generateId(),
        name: f.name,
        type,
        size: f.size,
        lastOpened: Date.now(),
        progress: 0,
        coverUrl,
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
              {settings.userName && (
                <div className="hidden sm:block ml-2 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                  <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                    {settings.userName}
                  </span>
                </div>
              )}
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
              <AppSettingsDialog />
              <div className="w-px h-4 bg-border mx-1" />
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
                {settings.libraryLayout === "grid" ? (
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
                ) : settings.libraryLayout === "list" ? (
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
                        <div className={`w-8 h-10 rounded shrink-0 bg-gradient-to-br ${f.type === 'pdf' ? 'from-red-500/20 to-red-900/10' : 'from-emerald-500/20 to-emerald-900/10'} flex items-center justify-center overflow-hidden border border-border/50`}>
                          {f.coverUrl ? (
                            <img src={f.coverUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <span className="text-[8px] font-mono uppercase text-muted-foreground/60">{f.type}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{f.name}</span>
                        <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${f.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{f.progress}%</span>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="compact"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3"
                  >
                    {filtered.map((f) => (
                      <motion.div
                        key={f.id}
                        whileHover={{ y: -2 }}
                        className="flex flex-col gap-1.5 p-2 rounded-md bg-secondary/20 border border-transparent hover:border-primary/30 cursor-pointer transition-all group"
                        onClick={() => handleOpen(f)}
                      >
                        <div className={`aspect-[3/4] rounded bg-muted/50 flex items-center justify-center overflow-hidden relative border border-border/40 bg-gradient-to-br ${f.type === 'pdf' ? 'from-red-500/10 to-red-900/5' : 'from-emerald-500/10 to-emerald-900/5'}`}>
                          {f.coverUrl ? (
                            <img src={f.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase">{f.type}</span>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20">
                            <div className="h-full bg-primary" style={{ width: `${f.progress}%` }} />
                          </div>
                        </div>
                        <span className="text-[11px] font-medium truncate group-hover:text-primary transition-colors">{f.name}</span>
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
