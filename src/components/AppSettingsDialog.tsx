import { useState } from "react";
import { Settings, Palette, Wrench, Languages, User, Monitor, LayoutGrid, List, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAppSettings, AppTheme, LibraryLayout, SortBy } from "@/lib/appSettings";
import { getDictionaries, saveDictionary, deleteDictionary, toggleDictionary, DictionaryData } from "@/lib/dictionaryStore";
import { useEffect } from "react";
import { toast } from "sonner";
import { Trash2, AlertCircle, Book } from "lucide-react";

export function AppSettingsDialog() {
  const { settings, updateSettings } = useAppSettings();
  const [open, setOpen] = useState(false);
  const [dicts, setDicts] = useState<DictionaryData[]>([]);

  useEffect(() => {
    if (open) {
      loadDicts();
    }
  }, [open]);

  const loadDicts = async () => {
    const list = await getDictionaries();
    setDicts(list);
  };


  const handleStarDictUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // We need .ifo, .idx, and .dict/.dict.dz
    const ifo = files.find(f => f.name.endsWith('.ifo'));
    const idx = files.find(f => f.name.endsWith('.idx'));
    const dict = files.find(f => f.name.endsWith('.dict') || f.name.endsWith('.dict.dz'));

    if (!ifo || !idx || !dict) {
      toast.error("StarDict requires 3 files: .ifo, .idx, and .dict", {
        description: "Please select all three together."
      });
      return;
    }

    try {
      const ifoText = await ifo.text();
      const idxBuffer = await idx.arrayBuffer();
      const dictBuffer = await dict.arrayBuffer();

      // Extract metadata from IFO
      const ifoMap: Record<string, string> = {};
      ifoText.split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) ifoMap[k.trim()] = v.trim();
      });

      const bookName = ifoMap['bookname'] || ifo.name.replace('.ifo', '');
      const wordCount = parseInt(ifoMap['wordcount'] || '0');

      const newDict: DictionaryData = {
        id: crypto.randomUUID(),
        name: bookName,
        bookName: bookName,
        wordCount: wordCount,
        ifoData: ifoText,
        idxData: idxBuffer,
        dictData: dictBuffer,
        enabled: true
      };

      await saveDictionary(newDict);
      await loadDicts();
      toast.success(`${bookName} installed successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to process StarDict files");
    }

    event.target.value = '';
  };

  const handleDelete = async (id: string) => {
    await deleteDictionary(id);
    await loadDicts();
    toast.success("Dictionary removed");
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleDictionary(id, enabled);
    await loadDicts();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 transition-colors" aria-label="Settings">
          <Settings className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 glass-surface border-primary/20">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Application Settings</DialogTitle>
              <DialogDescription>Customize your global sanctuary experience</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1">
              <TabsTrigger value="general" className="gap-2"><User className="h-3.5 w-3.5" /> General</TabsTrigger>
              <TabsTrigger value="appearance" className="gap-2"><Palette className="h-3.5 w-3.5" /> Identity</TabsTrigger>
              <TabsTrigger value="library" className="gap-2"><LayoutGrid className="h-3.5 w-3.5" /> Library</TabsTrigger>
              <TabsTrigger value="dictionaries" className="gap-2"><Languages className="h-3.5 w-3.5" /> Dictionaries</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-4 min-h-[400px]">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Reader Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="username"
                      value={settings.userName}
                      onChange={(e) => updateSettings({ userName: e.target.value })}
                      placeholder="Enter your name..."
                      className="bg-secondary/30"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">This name appears on your dashboard greeting.</p>
                </div>

                <Separator className="opacity-50" />

                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={settings.language} onValueChange={(v) => updateSettings({ language: v })}>
                    <SelectTrigger className="bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (US)</SelectItem>
                      <SelectItem value="zh">Chinese (Simplified)</SelectItem>
                      <SelectItem value="jp">Japanese</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-6 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Theme Preset</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { id: 'sanctuary', label: 'Sanctuary', color: 'bg-[#1a1c23]' },
                      { id: 'midnight', label: 'Midnight', color: 'bg-[#000000]' },
                      { id: 'forest', label: 'Forest', color: 'bg-[#141e17]' },
                      { id: 'arctic', label: 'Arctic', color: 'bg-[#f8f9fa] border' },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${settings.theme === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-lg ${t.color}`} />
                        <span className="text-sm font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Accent Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      '35 90% 55%',  // Amber
                      '142 70% 45%', // Emerald
                      '221 80% 55%', // Blue
                      '262 83% 58%', // Violet
                      '0 80% 60%',   // Ruby
                      '199 89% 48%', // Sky
                      '47 95% 50%',  // Gold
                      '280 65% 60%', // Amethyst
                    ].map((color) => (
                      <button
                        key={color}
                        onClick={() => updateSettings({ accentColor: color })}
                        className={`w-full aspect-square rounded-full border-2 transition-all hover:scale-110 ${settings.accentColor === color ? 'border-foreground scale-110' : 'border-transparent'
                          }`}
                        style={{ backgroundColor: `hsl(${color})` }}
                      />
                    ))}
                  </div>

                  <Separator className="my-4 opacity-50" />

                  <div className="space-y-3">
                    <Label className="text-xs">Glass Intensity — {settings.glassIntensity}%</Label>
                    <Slider
                      value={[settings.glassIntensity]}
                      onValueChange={([v]) => updateSettings({ glassIntensity: v })}
                      max={100} step={5}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Library Tab */}
            <TabsContent value="library" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Layout</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={settings.libraryLayout === 'grid' ? 'secondary' : 'outline'}
                      className="gap-2"
                      onClick={() => updateSettings({ libraryLayout: 'grid' })}
                    >
                      <LayoutGrid className="h-4 w-4" /> Grid
                    </Button>
                    <Button
                      variant={settings.libraryLayout === 'list' ? 'secondary' : 'outline'}
                      className="gap-2"
                      onClick={() => updateSettings({ libraryLayout: 'list' })}
                    >
                      <List className="h-4 w-4" /> List
                    </Button>
                    <Button
                      variant={settings.libraryLayout === 'compact' ? 'secondary' : 'outline'}
                      className="gap-2"
                      onClick={() => updateSettings({ libraryLayout: 'compact' })}
                    >
                      <div className="grid grid-cols-2 gap-0.5"><div className="w-1.5 h-1.5 bg-current rounded-full" /><div className="w-1.5 h-1.5 bg-current rounded-full" /></div> Compact
                    </Button>
                  </div>
                </div>

                <Separator className="opacity-50" />

                <div className="space-y-2">
                  <Label>Sort Library By</Label>
                  <Select value={settings.sortBy} onValueChange={(v) => updateSettings({ sortBy: v as SortBy })}>
                    <SelectTrigger className="bg-secondary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lastOpened">Recently Opened</SelectItem>
                      <SelectItem value="name">Alphabetical (A-Z)</SelectItem>
                      <SelectItem value="size">File Size</SelectItem>
                      <SelectItem value="progress">Reading Progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Dictionaries Tab */}
            <TabsContent value="dictionaries" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Dictionary Library</Label>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">IndexedDB Offline Storage</p>
                  </div>
                  <div className="relative">
                    <Input
                      type="file"
                      multiple
                      accept=".ifo,.idx,.dict,.dz"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleStarDictUpload}
                    />
                    <Button variant="outline" size="sm" className="gap-2 border-primary/30 hover:bg-primary/5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Install StarDict
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {dicts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center bg-primary/5">
                      <Languages className="h-8 w-8 mx-auto text-primary/20 mb-3" />
                      <p className="text-sm text-muted-foreground">No StarDict dictionaries installed yet.</p>
                      <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Select .ifo, .idx, and .dict files together</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {dicts.map((d) => (
                        <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/30 group">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${d.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                              <Book className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{d.bookName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {d.wordCount.toLocaleString()} words • {((d.dictData.byteLength + d.idxData.byteLength) / (1024 * 1024)).toFixed(1)} MB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={d.enabled}
                              onCheckedChange={(v) => handleToggle(d.id, v)}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100" onClick={() => handleDelete(d.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-3 flex gap-3">
                  <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-orange-500/80 leading-relaxed">
                    StarDict dictionaries (.ifo + .idx + .dict) are stored in your local browser database. Complex HTML formatting in some dictionaries may be simplified for better readability.
                  </p>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
