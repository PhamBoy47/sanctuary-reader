import { useCallback, useRef, useState } from "react";

export interface PageCurlApi {
  show3D: boolean;
  direction: "forward" | "backward";
  frontCanvas: HTMLCanvasElement | null;
  backCanvas: HTMLCanvasElement | null;
  start: (
    front: HTMLCanvasElement | null,
    back: HTMLCanvasElement | null,
    dir: "forward" | "backward",
  ) => Promise<void>;
  cancel: () => void;
  onAnimationEnd: () => void;
}

export function usePageCurl(): PageCurlApi {
  const [show3D, setShow3D] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [frontCanvas, setFrontCanvas] = useState<HTMLCanvasElement | null>(null);
  const [backCanvas, setBackCanvas] = useState<HTMLCanvasElement | null>(null);
  const resolveRef = useRef<((value?: unknown) => void) | null>(null);

  const start = useCallback((
    front: HTMLCanvasElement | null,
    back: HTMLCanvasElement | null,
    dir: "forward" | "backward",
  ): Promise<void> => {
    return new Promise((resolve) => {
      setFrontCanvas(front);
      setBackCanvas(back);
      setDirection(dir);
      setShow3D(true);
      resolveRef.current = resolve;
      setTimeout(() => {
        if (resolveRef.current === resolve) {
          resolveRef.current = null;
          setShow3D(false);
          resolve();
        }
      }, 2000);
    });
  }, []);

  const cancel = useCallback(() => {
    setShow3D(false);
    setFrontCanvas(null);
    setBackCanvas(null);
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, []);

  const onAnimationEnd = useCallback(() => {
    setShow3D(false);
    setFrontCanvas(null);
    setBackCanvas(null);
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, []);

  return { show3D, direction, frontCanvas, backCanvas, start, cancel, onAnimationEnd };
}
