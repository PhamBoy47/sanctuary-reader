import { useCallback, useEffect, useRef, useState } from "react";

export function useRenderWorker(fileData: Uint8Array | null, workerSrc: string) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!fileData) return;

    const worker = new Worker(new URL("../workers/renderWorker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === "ready") setIsReady(true);
    };

    worker.postMessage({ type: "init", payload: { data: fileData, workerSrc } });
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      setIsReady(false);
    };
  }, [fileData, workerSrc]);

  const renderPageOffscreen = useCallback(
    (pageNum: number, scale: number, rotation: number, canvas: HTMLCanvasElement): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current || !isReady) {
          resolve();
          return;
        }

        const handleMessage = (e: MessageEvent) => {
          const { type, payload } = e.data;
          if (type === "rendered" && payload.pageNum === pageNum) {
            workerRef.current?.removeEventListener("message", handleMessage);
            resolve();
          } else if (type === "render_error" && payload.pageNum === pageNum) {
            workerRef.current?.removeEventListener("message", handleMessage);
            reject(new Error(payload.error));
          }
        };

        workerRef.current.addEventListener("message", handleMessage);

        try {
          // Transfer control to offscreen
          const offscreen = canvas.transferControlToOffscreen();
          workerRef.current.postMessage(
            {
              type: "render",
              payload: {
                pageNum,
                scale,
                rotation,
                canvas: offscreen,
              },
            },
            [offscreen] // Transfer the offscreen canvas
          );
        } catch (err) {
          console.error("OffscreenCanvas transfer failed:", err);
          workerRef.current.removeEventListener("message", handleMessage);
          resolve(); // Fallback or handle error gracefully
        }
      });
    },
    [isReady]
  );

  return { isReady, renderPageOffscreen };
}
