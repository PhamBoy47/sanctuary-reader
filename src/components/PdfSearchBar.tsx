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
}

export function PdfSearchBar({
  isOpen, onClose, onSearch, onNextResult, onPrevResult,
  currentResult, totalResults,
}: PdfSearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    onSearch(value);
  }, [onSearch]);

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
          {totalResults > 0 ? `${currentResult}/${totalResults}` : "0"}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrevResult} disabled={totalResults === 0}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNextResult} disabled={totalResults === 0}>
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
