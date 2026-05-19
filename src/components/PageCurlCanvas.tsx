import { useEffect, useRef } from "react";
import * as THREE from "three";

interface PageCurlCanvasProps {
  show: boolean;
  frontCanvas: HTMLCanvasElement | null;
  backCanvas: HTMLCanvasElement | null;
  width: number;
  height: number;
  direction: "forward" | "backward";
  onAnimationEnd: () => void;
}

const SEGMENTS = 48;
const CURL_DURATION = 450;

export function PageCurlCanvas({
  show,
  frontCanvas,
  backCanvas,
  width,
  height,
  direction,
  onAnimationEnd,
}: PageCurlCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!show || !canvasRef.current || width <= 0 || height <= 0) return;

    const cvs = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = Math.round(width * dpr);
    cvs.height = Math.round(height * dpr);
    cvs.style.width = `${width}px`;
    cvs.style.height = `${height}px`;

    const renderer = new THREE.WebGLRenderer({
      canvas: cvs,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(dpr);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 5000);
    camera.position.set(0, 0, Math.max(width, height) * 1.6);
    camera.lookAt(0, 0, 0);

    const halfW = width / 2;
    const halfH = height / 2;

    function makeTexture(
      src: HTMLCanvasElement | null,
      fallbackColor: string,
    ): THREE.CanvasTexture {
      if (src && src.width > 0 && src.height > 0) {
        const tex = new THREE.CanvasTexture(src);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
      const c = document.createElement("canvas");
      c.width = Math.round(width);
      c.height = Math.round(height);
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, width * 0.15, height);
      g.addColorStop(0, "hsl(40,28%,94%)");
      g.addColorStop(0.45, "hsl(40,22%,89%)");
      g.addColorStop(1, "hsl(40,18%,84%)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const revealMat = new THREE.MeshBasicMaterial({
      map: makeTexture(backCanvas, "hsl(40,18%,84%)"),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const revealGeo = new THREE.PlaneGeometry(width, height, 1, 1);
    const revealMesh = new THREE.Mesh(revealGeo, revealMat);
    revealMesh.position.z = -3;
    scene.add(revealMesh);

    const curlTex = makeTexture(frontCanvas, "hsl(40,22%,89%)");
    const curlMat = new THREE.MeshBasicMaterial({
      map: curlTex,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const curlGeo = new THREE.PlaneGeometry(width, height, SEGMENTS, 1);
    const origPos = new Float32Array(curlGeo.attributes.position.array);
    const pos = curlGeo.attributes.position.array as Float32Array;

    const curlMesh = new THREE.Mesh(curlGeo, curlMat);
    scene.add(curlMesh);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    let running = true;
    let raf = 0;
    const startTime = performance.now();

    function updateCurl(p: number) {
      const pp = Math.max(0, Math.min(1, p));
      const flatW = (1 - pp) * width;
      const curlW = pp * width;
      const radius = curlW / Math.PI;
      const flatEndX = -halfW + flatW;

      const count = curlGeo.attributes.position.count;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const origX = origPos[idx];
        const origY = origPos[idx + 1];
        if (origX <= flatEndX) {
          pos[idx] = origX;
          pos[idx + 2] = 0;
        } else {
          const d = Math.min(origX - flatEndX, curlW);
          const theta = (d / curlW) * Math.PI;
          pos[idx] = flatEndX + radius * Math.sin(theta);
          pos[idx + 1] = origY;
          pos[idx + 2] = radius * (1 - Math.cos(theta));
        }
      }
      curlGeo.attributes.position.needsUpdate = true;
      curlGeo.computeVertexNormals();
    }

    function animate(time: number) {
      if (!running) return;
      raf = requestAnimationFrame(animate);

      const elapsed = time - startTime;
      const t = Math.min(1, elapsed / CURL_DURATION);

      const useT = direction === "forward" ? t : 1 - t;
      updateCurl(useT);

      revealMat.opacity = Math.min(1, t * 1.5);
      curlMat.opacity = Math.max(0, 1 - t * 1.4);

      if (t >= 1) {
        running = false;
        cancelAnimationFrame(raf);
        setTimeout(onAnimationEnd, 16);
      }

      renderer.render(scene, camera);
    }

    raf = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      renderer.dispose();
      curlGeo.dispose();
      revealGeo.dispose();
      curlMat.dispose();
      revealMat.dispose();
    };
  }, [show, width, height, direction, onAnimationEnd, frontCanvas, backCanvas]);

  return (
    <canvas
      ref={canvasRef}
      className="page-curl-canvas"
      style={{ display: show ? "block" : "none" }}
    />
  );
}
