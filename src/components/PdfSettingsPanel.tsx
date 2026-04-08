import { useState } from "react";
import { Settings, Printer, ArrowDownUp, Palette, Wrench, Puzzle, Sun, Moon, Type, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export type ScrollDirection = "vertical" | "horizontal";
export type PageBackground = "default" | "warm" | "cool" | "sepia";

export interface PdfSettings {
  scrollDirection: ScrollDirection;
  pageBackground: PageBackground;
  brightness: number;
  invertColors: boolean;
  showAnnotations: boolean;
  continuousScroll: boolean;
  autoFitWidth: boolean;
  highlightLinks: boolean;
  enableTextSelection: boolean;
}

const defaultSettings: PdfSettings = {
  scrollDirection: "vertical",
  pageBackground: "default",
  brightness: 100,
  invertColors: false,
  showAnnotations: true,
  continuousScroll: false,
  autoFitWidth: true,
  highlightLinks: true,
  enableTextSelection: true,
};

interface PdfSettingsPanelProps {
  settings: PdfSettings;
  onSettingsChange: (settings: PdfSettings) => void;
  onPrint: () => void;
  onRotatePage?: () => void;
}

export function PdfSettingsPanel({ settings, onSettingsChange, onPrint, onRotatePage }: PdfSettingsPanelProps) {
  const [open, setOpen] = useState(false);

  const update = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            PDF Settings
          </DialogTitle>
          <DialogDescription>Customize your reading experience</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="appearance" className="text-xs gap-1">
              <Palette className="h-3 w-3" />
              <span className="hidden sm:inline">Look</span>
            </TabsTrigger>
            <TabsTrigger value="scroll" className="text-xs gap-1">
              <ArrowDownUp className="h-3 w-3" />
              <span className="hidden sm:inline">Scroll</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="text-xs gap-1">
              <Wrench className="h-3 w-3" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
            <TabsTrigger value="addons" className="text-xs gap-1">
              <Puzzle className="h-3 w-3" />
              <span className="hidden sm:inline">Add-ons</span>
            </TabsTrigger>
          </TabsList>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page Background</Label>
              <Select
                value={settings.pageBackground}
                onValueChange={(v) => update("pageBackground", v as PageBackground)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <span className="flex items-center gap-2"><Moon className="h-3 w-3" /> Default (Dark)</span>
                  </SelectItem>
                  <SelectItem value="warm">
                    <span className="flex items-center gap-2"><Sun className="h-3 w-3" /> Warm</span>
                  </SelectItem>
                  <SelectItem value="cool">
                    <span className="flex items-center gap-2"><Palette className="h-3 w-3" /> Cool</span>
                  </SelectItem>
                  <SelectItem value="sepia">
                    <span className="flex items-center gap-2"><Type className="h-3 w-3" /> Sepia</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Brightness — {settings.brightness}%
              </Label>
              <Slider
                value={[settings.brightness]}
                onValueChange={([v]) => update("brightness", v)}
                min={30}
                max={150}
                step={5}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-muted-foreground" />
                Invert Colors
              </Label>
              <Switch
                checked={settings.invertColors}
                onCheckedChange={(v) => update("invertColors", v)}
              />
            </div>
          </TabsContent>

          {/* Scroll Tab */}
          <TabsContent value="scroll" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scroll Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={settings.scrollDirection === "vertical" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => update("scrollDirection", "vertical")}
                >
                  ↕ Vertical
                </Button>
                <Button
                  variant={settings.scrollDirection === "horizontal" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => update("scrollDirection", "horizontal")}
                >
                  ↔ Horizontal
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Auto Fit Width</Label>
              <Switch
                checked={settings.autoFitWidth}
                onCheckedChange={(v) => update("autoFitWidth", v)}
              />
            </div>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4 mt-4">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onPrint}>
              <Printer className="h-4 w-4" />
              Print Document
            </Button>

            {onRotatePage && (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={onRotatePage}>
                <RotateCcw className="h-4 w-4" />
                Rotate Page
              </Button>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Enable Text Selection</Label>
              <Switch
                checked={settings.enableTextSelection}
                onCheckedChange={(v) => update("enableTextSelection", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Show Annotations</Label>
              <Switch
                checked={settings.showAnnotations}
                onCheckedChange={(v) => update("showAnnotations", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Highlight Links</Label>
              <Switch
                checked={settings.highlightLinks}
                onCheckedChange={(v) => update("highlightLinks", v)}
              />
            </div>
          </TabsContent>

          {/* Add-ons Tab */}
          <TabsContent value="addons" className="space-y-4 mt-4">
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center">
              <Puzzle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                Add-ons coming soon
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Bookmarks, highlights, notes, and more
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export { defaultSettings };
