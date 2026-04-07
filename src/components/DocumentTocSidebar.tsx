import { ListTree, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TocItem {
  id: string;
  label: string;
  hint?: string;
  children?: TocItem[];
}

interface DocumentTocSidebarProps {
  activeId?: string | null;
  isOpen: boolean;
  items: TocItem[];
  onClose: () => void;
  onSelect: (item: TocItem) => void;
  title?: string;
}

interface TocNodeProps {
  activeId?: string | null;
  depth: number;
  item: TocItem;
  onSelect: (item: TocItem) => void;
}

function TocNode({ activeId, depth, item, onSelect }: TocNodeProps) {
  const isActive = activeId === item.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={[
          "flex w-full items-start gap-2 rounded-md py-2 text-left transition-colors hover:bg-secondary",
          isActive ? "bg-secondary" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: `${depth * 14 + 12}px`, paddingRight: "12px" }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{item.label}</span>
          {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
        </span>
      </button>

      {item.children?.map((child) => (
        <TocNode key={child.id} activeId={activeId} depth={depth + 1} item={child} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function DocumentTocSidebar({
  activeId,
  isOpen,
  items,
  onClose,
  onSelect,
  title = "Table of contents",
}: DocumentTocSidebarProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close table of contents"
        className="absolute inset-0 z-20 bg-background/70 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />

      <aside className="absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ListTree className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
          </div>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">No table of contents available.</p>
          ) : (
            items.map((item) => <TocNode key={item.id} activeId={activeId} depth={0} item={item} onSelect={onSelect} />)
          )}
        </div>
      </aside>
    </>
  );
}