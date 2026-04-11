import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShortcutGroup {
  name: string;
  keys: { key: string; label: string }[];
}

const shortcuts: ShortcutGroup[] = [
  {
    name: "Navigation",
    keys: [
      { key: "ArrowRight / Left", label: "Next / Previous Page" },
      { key: "Shift + Arrow", label: "Fast Flip (5 Pages)" },
      { key: "Home / End", label: "First / Last Page" },
      { key: "Space / PageDown", label: "Scroll Down / Next Page" },
    ],
  },
  {
    name: "View & Modes",
    keys: [
      { key: "d", label: "Cycle Display Mode (Single / Continuous / Two-page)" },
      { key: "Ctrl + L", label: "Toggle Fullscreen" },
      { key: "Ctrl + \\", label: "Toggle Fit Width" },
      { key: "Ctrl + R", label: "Rotate Clockwise" },
      { key: "Ctrl + Shift + R", label: "Rotate Counter-clockwise" },
      { key: "Ctrl + Shift + H", label: "Toggle Auto-scroll" },
    ],
  },
  {
    name: "Tools & Annotations",
    keys: [
      { key: "Ctrl + S", label: "Save Progress / Annotations" },
      { key: "Ctrl + F", label: "Search inside document" },
      { key: "Shift + H", label: "Highlight selection" },
      { key: "Shift + S", label: "Toggle Symbol placement mode" },
      { key: "Ctrl + B", label: "Toggle Sidebar / TOC" },
      { key: "Ctrl + ,", label: "Open Bookmarks / Settings" },
      { key: "Ctrl + P", label: "Print Document" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Keyboard Shortcuts (?)">
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md glass-surface border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-sanctuary-blue" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {shortcuts.map((group) => (
            <div key={group.name} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2">
                {group.name}
              </h3>
              <div className="space-y-1.5">
                {group.keys.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-sm">
                    <span className="text-foreground/80">{s.label}</span>
                    <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 italic">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
