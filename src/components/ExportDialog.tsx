/**
 * ExportDialog — modal for exporting annotations to Markdown or CSV.
 */
import { useState, useCallback } from "react";
import { FileText, FileSpreadsheet, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToMarkdown, exportToCsv, downloadBlob } from "@/lib/exportAnnotations";
import { toast } from "sonner";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}

export function ExportDialog({ isOpen, onClose, fileId, fileName }: ExportDialogProps) {
  const [format, setFormat] = useState<"markdown" | "csv">("markdown");
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Generate preview when format changes or dialog opens
  const generatePreview = useCallback(async () => {
    setLoading(true);
    try {
      const content = format === "markdown"
        ? await exportToMarkdown(fileId, fileName)
        : await exportToCsv(fileId, fileName);
      setPreview(content);
    } catch (err) {
      setPreview("Error generating preview");
      console.error(err);
    }
    setLoading(false);
  }, [format, fileId, fileName]);

  // Auto-generate preview when dialog opens
  useState(() => {
    if (isOpen) generatePreview();
  });

  const handleDownload = useCallback(async () => {
    try {
      const baseName = fileName.replace(/\.(pdf|epub)$/i, "");
      if (format === "markdown") {
        const content = await exportToMarkdown(fileId, fileName);
        downloadBlob(content, `${baseName}_annotations.md`, "text/markdown");
      } else {
        const content = await exportToCsv(fileId, fileName);
        downloadBlob(content, `${baseName}_annotations.csv`, "text/csv");
      }
      toast.success("Annotations exported!");
      onClose();
    } catch (err) {
      toast.error("Export failed");
      console.error(err);
    }
  }, [format, fileId, fileName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-xl border border-border glass-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Export Annotations</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Format selector */}
        <div className="flex gap-2 px-5 pt-4">
          <button
            onClick={() => { setFormat("markdown"); generatePreview(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-xs font-medium ${
              format === "markdown"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            <FileText className="h-4 w-4" />
            Markdown
          </button>
          <button
            onClick={() => { setFormat("csv"); generatePreview(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-xs font-medium ${
              format === "csv"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </button>
        </div>

        {/* Preview */}
        <div className="px-5 py-3">
          <div className="rounded-lg border border-border bg-background/50 p-3 max-h-60 overflow-auto">
            {loading ? (
              <p className="text-xs text-muted-foreground animate-pulse">Generating preview…</p>
            ) : (
              <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                {preview || "Click a format to preview"}
              </pre>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download {format === "markdown" ? ".md" : ".csv"}
          </Button>
        </div>
      </div>
    </div>
  );
}
