import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Book, Volume2, Languages, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import DOMPurify from 'dompurify';

interface DictionaryPopoverProps {
  word: string;
  definitions: string[];
  onClose: () => void;
  position: { x: number; y: number };
}

export function DictionaryPopover({ word, definitions, onClose, position }: DictionaryPopoverProps) {
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-place popover to stay within viewport
  const [coords, setCoords] = useState(position);

  useEffect(() => {
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect();
      let { x, y } = position;

      // Adjust X
      if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 20;
      }
      if (x < 20) x = 20;

      // Adjust Y
      if (y + rect.height > window.innerHeight) {
        y = position.y - rect.height - 20;
      }
      if (y < 20) y = 20;

      setCoords({ x, y });
    }
  }, [position]);

  const handleCopy = () => {
    const text = definitions.map(d => d.replace(/<[^>]*>/g, '')).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        className="fixed z-[9999] w-[400px] max-h-[500px] flex flex-col glass-surface shadow-2xl rounded-2xl border-primary/20 overflow-hidden"
        style={{ left: coords.x, top: coords.y }}
      >
        {/* Header */}
        <div className="p-4 border-b border-primary/10 flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Book className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground leading-none">{word}</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Sanctuary Definition</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-5 overflow-y-auto custom-dictionary-content">
          {definitions.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <Languages className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No definitions found in enabled dictionaries.</p>
                <p className="text-[10px] text-muted-foreground/50">Sanctuary is currently offline</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 border-primary/20 hover:bg-primary/5 text-xs text-primary"
                onClick={() => window.open(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(word)}&op=translate`, '_blank')}
              >
                Search Online
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {definitions.map((def, idx) => (
                <div key={idx} className="relative">
                  {idx > 0 && <Separator className="mb-8 opacity-30" />}
                  <div 
                    className="dictionary-html-content text-sm leading-relaxed text-foreground/90 prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(def) }}
                  />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {/* Footer info */}
        <div className="px-4 py-2 border-t border-primary/5 bg-muted/30 flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">Sanctuary Dictionary</span>
          <div className="flex gap-2">
            <Volume2 className="h-3 w-3 text-muted-foreground/50 hover:text-primary cursor-pointer transition-colors" />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Global CSS for MDict content (added to index.css or here)
// This handles standard MDict styling conventions
const style = document.createElement('style');
style.textContent = `
  .dictionary-html-content p { margin-bottom: 0.5em; }
  .dictionary-html-content font[color="red"] { color: hsl(var(--destructive)); }
  .dictionary-html-content font[color="blue"] { color: hsl(var(--primary)); }
  .dictionary-html-content b { color: hsl(var(--foreground)); font-weight: 600; }
  /* Prevent dictionary styles from taking over */
  .dictionary-html-content * { max-width: 100% !important; }
`;
document.head.appendChild(style);
