import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomTitlebar, isTauri } from "@/components/CustomTitlebar";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (!isTauri()) return;
    const setupTray = async () => {
      try {
        const { TrayIcon } = await import("@tauri-apps/api/tray");
        const { Menu } = await import("@tauri-apps/api/menu");
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { exit } = await import("@tauri-apps/plugin-process");
        
        const menu = await Menu.new({
          items: [
            {
              id: "show",
              text: "Show Sanctuary Reader",
              action: async () => {
                const win = getCurrentWindow();
                await win.show();
                await win.setFocus();
              }
            },
            {
              id: "quit",
              text: "Quit",
              action: async () => {
                await exit(0);
              }
            }
          ]
        });

        // Use default window icon for tray
        await TrayIcon.new({
          id: "main",
          menu,
          menuOnLeftClick: true,
          tooltip: "Sanctuary Reader",
          action: async (e) => {
            if (e.type === "Click") {
              const win = getCurrentWindow();
              await win.show();
              await win.setFocus();
            }
          }
        });
      } catch (err) {
        console.error("Tray setup failed:", err);
      }
    };
    setupTray();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <div className="flex flex-col h-screen">
        {isTauri() && <CustomTitlebar />}
        <div className="flex-1 min-h-0">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
