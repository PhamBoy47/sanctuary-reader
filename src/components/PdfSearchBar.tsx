import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PdfSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  onNextResult: () => void;
  onPrevResult: () => void;
  currentResult: number;
  totalResults: number;
  /**
   * Pre-seed the search bar when it opens from a context menu / selection.
   * This value is only read ONCE when isOpen transitions from false → true.
   * It does NOT create a live binding, so typing after open is never interrupted.
   */
  seed?: string;
}

export function PdfSearchBar({
  isOpen, onClose, onSearch, onNextResult, onPrevResult,
  currentResult, totalResults, seed = ""
}: PdfSearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  useEffect(() => { onSearchRef.current = onSearch; }, [onSearch]);

  // Fire ONLY when the bar transitions open (false → true). Capture seed at that moment.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    prevOpenRef.current = isOpen;

    if (justOpened) {
      // Seed the input with whatever was passed at open time
      setQuery(seed);
      if (seed) {
        onSearchRef.current(seed);
      }
      setTimeout(() => {
        inputRef.current?.focus();
        if (seed) inputRef.current?.select();
      }, 80);
    }

    if (!isOpen) {
      setQuery("");
    }
    // seed intentionally excluded — we only want the value that was current when isOpen fired
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    onSearchRef.current(value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) onPrevResult();
      else onNextResult();
    }
    if (e.key === "Escape") onClose();
  }, [onNextResult, onPrevResult, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 z-50 m-2 flex items-center gap-1.5 rounded-lg glass-surface px-3 py-2 shadow-lg border border-border">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in document…"
        className="h-7 w-48 text-xs px-2 bg-transparent border-none focus-visible:ring-0"
      />
      {query && (
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
          {totalResults > 0 ? `${currentResult}/${totalResults}` : "0 results"}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrevResult} disabled={totalResults === 0} title="Previous match">
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNextResult} disabled={totalResults === 0} title="Next match">
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close search">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
