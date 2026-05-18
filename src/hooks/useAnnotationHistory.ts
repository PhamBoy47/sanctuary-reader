/**
 * useAnnotationHistory — Command-pattern undo/redo for annotation mutations.
 *
 * Wraps every addBookmark/removeBookmark/addHighlight/… call so that
 * Ctrl+Z / Ctrl+Y can reverse and replay them.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  addBookmark, removeBookmark,
  addHighlight, removeHighlight,
  addSymbolAnnotation, removeSymbolAnnotation,
  restoreBookmark, restoreHighlight, restoreSymbolAnnotation,
  type Bookmark, type Highlight, type SymbolAnnotation,
} from "@/lib/annotationStore";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

type EntityType = "bookmark" | "highlight" | "symbol";

interface AnnotationAction {
  type: "add" | "remove";
  entity: EntityType;
  data: Bookmark | Highlight | SymbolAnnotation;
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useAnnotationHistory(fileId: string) {
  const undoStackRef = useRef<AnnotationAction[]>([]);
  const redoStackRef = useRef<AnnotationAction[]>([]);
  const fileIdRef = useRef(fileId);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [annotationVersion, setAnnotationVersion] = useState(0);

  useEffect(() => {
    if (fileIdRef.current !== fileId) {
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      fileIdRef.current = fileId;
    }
  }, [fileId]);

  const bump = useCallback(() => setAnnotationVersion((v) => v + 1), []);

  const syncFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const MAX_UNDO = 100;

  const pushUndo = useCallback((action: AnnotationAction) => {
    const stack = [...undoStackRef.current, action];
    if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
    undoStackRef.current = stack;
    redoStackRef.current = [];
    syncFlags();
  }, [syncFlags]);

  // ── Wrapped mutations ────────────────────────────────────────────────

  const doAddBookmark = useCallback(async (
    page: number, label?: string,
  ): Promise<Bookmark> => {
    const bm = await addBookmark(fileId, page, label);
    pushUndo({ type: "add", entity: "bookmark", data: bm });
    bump();
    return bm;
  }, [fileId, pushUndo, bump]);

  const doRemoveBookmark = useCallback(async (id: string, bookmark: Bookmark) => {
    await removeBookmark(id);
    pushUndo({ type: "remove", entity: "bookmark", data: bookmark });
    bump();
  }, [pushUndo, bump]);

  const doAddHighlight = useCallback(async (
    page: number, color: string, text: string,
    rects: Highlight["rects"],
    charOffset?: number, charLength?: number,
    cfi?: string,
  ): Promise<Highlight> => {
    const hl = await addHighlight(fileId, page, color, text, rects, charOffset, charLength, cfi);
    pushUndo({ type: "add", entity: "highlight", data: hl });
    bump();
    return hl;
  }, [fileId, pushUndo, bump]);

  const doRemoveHighlight = useCallback(async (id: string, highlight: Highlight) => {
    await removeHighlight(id);
    pushUndo({ type: "remove", entity: "highlight", data: highlight });
    bump();
  }, [pushUndo, bump]);

  const doAddSymbol = useCallback(async (
    page: number, symbol: string, x: number, y: number,
  ): Promise<SymbolAnnotation> => {
    const ann = await addSymbolAnnotation(fileId, page, symbol, x, y);
    pushUndo({ type: "add", entity: "symbol", data: ann });
    bump();
    return ann;
  }, [fileId, pushUndo, bump]);

  const doRemoveSymbol = useCallback(async (id: string, ann: SymbolAnnotation) => {
    await removeSymbolAnnotation(id);
    pushUndo({ type: "remove", entity: "symbol", data: ann });
    bump();
  }, [pushUndo, bump]);

  // ── Undo / Redo ──────────────────────────────────────────────────────

  const undo = useCallback(async () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;

    const action = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);

    try {
      if (action.type === "add") {
        // Reverse an add → remove
        switch (action.entity) {
          case "bookmark": await removeBookmark(action.data.id); break;
          case "highlight": await removeHighlight(action.data.id); break;
          case "symbol": await removeSymbolAnnotation(action.data.id); break;
        }
      } else {
        // Reverse a remove → re-add with original ID
        switch (action.entity) {
          case "bookmark": await restoreBookmark(action.data as Bookmark); break;
          case "highlight": await restoreHighlight(action.data as Highlight); break;
          case "symbol": await restoreSymbolAnnotation(action.data as SymbolAnnotation); break;
        }
      }

      redoStackRef.current = [...redoStackRef.current, action];
      bump();
      syncFlags();

      const verb = action.type === "add" ? "removed" : "restored";
      toast(`Undo: ${action.entity} ${verb}`);
    } catch (err) {
      console.error("Undo failed:", err);
      toast.error("Undo failed");
    }
  }, [bump, syncFlags]);

  const redo = useCallback(async () => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;

    const action = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);

    try {
      if (action.type === "add") {
        // Re-do an add → re-add with original ID
        switch (action.entity) {
          case "bookmark": await restoreBookmark(action.data as Bookmark); break;
          case "highlight": await restoreHighlight(action.data as Highlight); break;
          case "symbol": await restoreSymbolAnnotation(action.data as SymbolAnnotation); break;
        }
      } else {
        // Re-do a remove → remove again
        switch (action.entity) {
          case "bookmark": await removeBookmark(action.data.id); break;
          case "highlight": await removeHighlight(action.data.id); break;
          case "symbol": await removeSymbolAnnotation(action.data.id); break;
        }
      }

      undoStackRef.current = [...undoStackRef.current, action];
      bump();
      syncFlags();

      const verb = action.type === "add" ? "re-added" : "re-removed";
      toast(`Redo: ${action.entity} ${verb}`);
    } catch (err) {
      console.error("Redo failed:", err);
      toast.error("Redo failed");
    }
  }, [bump, syncFlags]);

  return {
    doAddBookmark, doRemoveBookmark,
    doAddHighlight, doRemoveHighlight,
    doAddSymbol, doRemoveSymbol,
    undo, redo,
    canUndo, canRedo,
    annotationVersion,
  };
}
