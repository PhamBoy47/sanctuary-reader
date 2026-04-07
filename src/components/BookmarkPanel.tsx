import { useState, useEffect, useCallback } from "react";
import { Bookmark, Trash2, Edit3, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getBookmarks, addBookmark, removeBookmark, updateBookmarkLabel,
  type Bookmark as BookmarkType,
} from "@/lib/annotationStore";
import { toast } from "sonner";

interface BookmarkPanelProps {
  fileId: string;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

export function BookmarkPanel({ fileId, currentPage, onPageSelect }: BookmarkPanelProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const reload = useCallback(async () => {
    setBookmarks(await getBookmarks(fileId));
  }, [fileId]);

  useEffect(() => { reload(); }, [reload]);

  const isCurrentPageBookmarked = bookmarks.some((b) => b.page === currentPage);

  const handleAdd = async () => {
    if (isCurrentPageBookmarked) {
      toast.info("Page already bookmarked");
      return;
    }
    await addBookmark(fileId, currentPage);
    toast.success(`Bookmarked page ${currentPage}`);
    reload();
  };

  const handleRemove = async (id: string) => {
    await removeBookmark(id);
    toast.success("Bookmark removed");
    reload();
  };

  const handleEdit = (bm: BookmarkType) => {
    setEditingId(bm.id);
    setEditLabel(bm.label);
  };

  const handleSaveEdit = async () => {
    if (editingId && editLabel.trim()) {
      await updateBookmarkLabel(editingId, editLabel.trim());
      setEditingId(null);
      reload();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5 text-primary" />
          Bookmarks
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd} title="Bookmark current page">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {bookmarks.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No bookmarks yet. Click + to bookmark the current page.
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors
                  ${bm.page === currentPage ? "bg-primary/15 text-primary" : "hover:bg-secondary text-foreground"}`}
              >
                {editingId === bm.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                      className="h-6 text-xs flex-1"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSaveEdit}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Bookmark className="h-3 w-3 shrink-0 text-primary" />
                    <span className="flex-1 truncate" onClick={() => onPageSelect(bm.page)}>
                      {bm.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      p.{bm.page}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button className="p-0.5 hover:text-primary" onClick={() => handleEdit(bm)}>
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button className="p-0.5 hover:text-destructive" onClick={() => handleRemove(bm.id)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
