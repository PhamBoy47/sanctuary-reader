import { motion } from "framer-motion";
import { FileText, BookOpen, Trash2 } from "lucide-react";
import { FileEntry, formatFileSize } from "@/lib/fileStore";

const typeIcons = {
  pdf: FileText,
  epub: BookOpen,
};

const typeColors: Record<string, string> = {
  pdf: "from-red-500/20 to-red-900/10",
  epub: "from-emerald-500/20 to-emerald-900/10",
};

const typeBadgeColors: Record<string, string> = {
  pdf: "bg-red-500/20 text-red-300",
  epub: "bg-emerald-500/20 text-emerald-300",
};

interface FileCardProps {
  file: FileEntry;
  onOpen: (file: FileEntry) => void;
  onDelete: (id: string) => void;
}

export function FileCard({ file, onOpen, onDelete }: FileCardProps) {
  const Icon = typeIcons[file.type];
  const timeAgo = getTimeAgo(file.lastOpened);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="group relative cursor-pointer rounded-xl border border-border bg-card overflow-hidden"
      onClick={() => onOpen(file)}
    >
      {/* Cover / Icon area */}
      <div className={`relative h-44 bg-gradient-to-br ${typeColors[file.type]} flex items-center justify-center overflow-hidden`}>
        {file.coverUrl ? (
          <img 
            src={file.coverUrl} 
            alt={file.name} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
          />
        ) : (
          <Icon className="h-16 w-16 text-muted-foreground/40" />
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        <span className={`absolute top-3 right-3 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full z-10 ${typeBadgeColors[file.type]}`}>
          {file.type}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
          className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-destructive/80 hover:bg-destructive z-10"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive-foreground" />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <h3 className="text-sm font-medium text-foreground truncate">{file.name}</h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatFileSize(file.size)}</span>
          <span>{timeAgo}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${file.progress}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-right">{file.progress}%</p>
      </div>
    </motion.div>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
