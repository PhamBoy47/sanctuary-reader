import { useState, useCallback, useEffect } from "react";
import {
  ArrowLeft, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight,
  Printer, RotateCcw, Palette, Moon, Sun, Type, ArrowDownUp,
  Bookmark, Highlighter, Sticker, Keyboard
} from "lucide-react";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { PdfSettings, PageBackground } from "@/components/PdfSettingsPanel";

interface ViewerToolbarProps {
  title: string;
  onBack: () => void;
  currentPage?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onPageJump?: (page: number) => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitWidth?: () => void;
  onToggleAutoFitWidth?: () => void;
  settings?: PdfSettings;
  onSettingsChange?: (settings: PdfSettings) => void;
  onPrint?: () => void;
  onRotatePage?: () => void;
  onToggleBookmarks?: () => void;
  onToggleHighlights?: () => void;
  onToggleSymbols?: () => void;
  bookmarksOpen?: boolean;
  highlightsOpen?: boolean;
  symbolsOpen?: boolean;
  children?: React.ReactNode;
}

export function ViewerToolbar({
  title, onBack, currentPage, totalPages,
  onPrevPage, onNextPage, onPageJump,
  zoom, onZoomIn, onZoomOut, onFitWidth, onToggleAutoFitWidth,
  settings, onSettingsChange, onPrint, onRotatePage,
  onToggleBookmarks, onToggleHighlights, onToggleSymbols,
  bookmarksOpen, highlightsOpen, symbolsOpen,
  children,
}: ViewerToolbarProps) {
  const [jumpValue, setJumpValue] = useState(currentPage?.toString() || "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setJumpValue(currentPage?.toString() || "");
    }
  }, [currentPage, isEditing]);

  const handleJump = useCallback(() => {
    setIsEditing(false);
    const p = parseInt(jumpValue, 10);
    if (!isNaN(p) && p >= 1 && totalPages && p <= totalPages && onPageJump && p !== currentPage) {
      onPageJump(p);
    } else {
      setJumpValue(currentPage?.toString() || "");
    }
  }, [jumpValue, totalPages, onPageJump, currentPage]);

  const updateSetting = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    if (settings && onSettingsChange) {
      onSettingsChange({ ...settings, [key]: value });
    }
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-1 px-3 py-1.5 glass-surface flex-wrap">
      <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-xs font-medium text-foreground truncate max-w-[140px] mr-1">{title}</h2>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Page Navigation */}
      {currentPage != null && totalPages != null && (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevPage} disabled={currentPage <= 1} title="Previous Page (ArrowLeft)" data-testid="prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center min-w-[60px] text-[13px] text-muted-foreground font-mono">
            {onPageJump ? (
              <Input
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleJump();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onFocus={(e) => {
                  setIsEditing(true);
                  e.target.select();
                }}
                onBlur={handleJump}
                className="h-6 w-10 text-center text-[13px] p-0 bg-transparent border-transparent hover:border-input focus-visible:ring-1 focus-visible:border-input focus-visible:bg-background mr-1"
                title="Go to page (Enter)"
              />
            ) : (
              <span className="mr-1">{currentPage}</span>
            )}
            <span>/ {totalPages}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNextPage} disabled={currentPage >= totalPages} title="Next Page (ArrowRight)" data-testid="next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Zoom */}
      {zoom != null && (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut} title="Zoom Out (Ctrl + -)" data-testid="zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn} title="Zoom In (Ctrl + =)" data-testid="zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          {settings && onSettingsChange && onToggleAutoFitWidth ? (
            <Button 
              variant={settings.autoFitWidth ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={onToggleAutoFitWidth} 
              title={settings.autoFitWidth ? "Disable Auto Fit Width (Ctrl + \\)" : "Enable Auto Fit Width (Ctrl + \\)"}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : onFitWidth ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFitWidth} title="Fit width (Ctrl + \\)">
              <Maximize2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Appearance Dropdown */}
      {settings && onSettingsChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Appearance">
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-3 space-y-3">
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground px-0">Appearance</DropdownMenuLabel>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Page Background</Label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { bg: "default" as PageBackground, icon: Moon, label: "Dark" },
                  { bg: "warm" as PageBackground, icon: Sun, label: "Warm" },
                  { bg: "cool" as PageBackground, icon: Palette, label: "Cool" },
                  { bg: "sepia" as PageBackground, icon: Type, label: "Sepia" },
                ] as const).map(({ bg, icon: Icon, label }) => (
                  <Button
                    key={bg}
                    variant={settings.pageBackground === bg ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-[10px] gap-1 px-1"
                    onClick={() => updateSetting("pageBackground", bg)}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Brightness — {settings.brightness}%</Label>
              <Slider
                value={[settings.brightness]}
                onValueChange={([v]) => updateSetting("brightness", v)}
                min={30} max={150} step={5}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Moon className="h-3 w-3 text-muted-foreground" />
                Invert Colors
              </Label>
              <Switch
                checked={settings.invertColors}
                onCheckedChange={(v) => updateSetting("invertColors", v)}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Layout Dropdown */}
      {settings && onSettingsChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Layout">
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-3 space-y-3">
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground px-0">Layout & Scroll</DropdownMenuLabel>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Scroll Direction</Label>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={settings.scrollDirection === "vertical" ? "secondary" : "ghost"}
                  size="sm" className="h-7 text-xs"
                  onClick={() => updateSetting("scrollDirection", "vertical")}
                >↕ Vertical</Button>
                <Button
                  variant={settings.scrollDirection === "horizontal" ? "secondary" : "ghost"}
                  size="sm" className="h-7 text-xs"
                  onClick={() => updateSetting("scrollDirection", "horizontal")}
                >↔ Horizontal</Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Auto Fit Width</Label>
              <Switch checked={settings.autoFitWidth} onCheckedChange={() => onToggleAutoFitWidth?.()} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Tools Dropdown */}
      {(onPrint || onRotatePage || settings) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Tools">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Tools</DropdownMenuLabel>
            {onPrint && (
              <DropdownMenuItem onClick={onPrint}>
                <Printer className="h-4 w-4 mr-2" /> Print Document (Ctrl + P)
              </DropdownMenuItem>
            )}
            {onRotatePage && (
              <DropdownMenuItem onClick={onRotatePage}>
                <RotateCcw className="h-4 w-4 mr-2" /> Rotate Page (Ctrl + R)
              </DropdownMenuItem>
            )}
            {settings && onSettingsChange && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <Label className="text-xs">Show Annotations</Label>
                  <Switch checked={settings.showAnnotations} onCheckedChange={(v) => updateSetting("showAnnotations", v)} />
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <Label className="text-xs">Highlight Links</Label>
                  <Switch checked={settings.highlightLinks} onCheckedChange={(v) => updateSetting("highlightLinks", v)} />
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Annotation toggles */}
      {onToggleBookmarks && (
        <Button
          variant={bookmarksOpen ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={onToggleBookmarks}
          title="Bookmarks (Ctrl + ,)"
        >
          <Bookmark className="h-4 w-4" />
        </Button>
      )}
      {onToggleHighlights && (
        <Button
          variant={highlightsOpen ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={onToggleHighlights}
          title="Highlights (Shift + H)"
        >
          <Highlighter className="h-4 w-4" />
        </Button>
      )}
      {onToggleSymbols && (
        <Button
          variant={symbolsOpen ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={onToggleSymbols}
          title="Symbol Annotations (Shift + S)"
        >
          <Sticker className="h-4 w-4" />
        </Button>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Shortcuts Help */}
      <KeyboardShortcutsDialog />

      <div className="flex-1" />

      {children}
    </div>
  );
}
