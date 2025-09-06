/**
 * detector.ts
 * Escaneo por VIDEO usando BarcodeDetector nativo. Si no existe,
 * el caller puede hacer fallback a Quagga (ver quagga.ts).
 */

export function supportsNativeDetector(): boolean {
  return typeof (window as any).BarcodeDetector !== "undefined";
}

export type StopFn = () => void;

const FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "qr_code",
  "pdf417",
] as const;

export async function startNativeDetector(
  videoEl: HTMLVideoElement,
  onDetected: (code: string) => void,
  opts: { throttleMs?: number } = {}
): Promise<StopFn> {
  const throttle = Math.max(50, opts.throttleMs ?? 120); // ~8 fps
  const Detector = (window as any).BarcodeDetector;
  const detector = new Detector({ formats: FORMATS });

  let stopped = false;
  let last = 0;

  // Algunos dispositivos requieren dibujar en canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  async function tick(ts: number) {
    if (stopped) return;
    requestAnimationFrame(tick);

    if (ts - last < throttle) return;
    last = ts;

    if (videoEl.readyState < 2) return;

    try {
      // Intento directo
      const res = await detector.detect(videoEl);
      if (res && res.length) {
        const raw = res[0].rawValue || res[0].raw || "";
        if (raw) {
          stopped = true;
          onDetected(raw);
          return;
        }
      }
    } catch (e) {
      // Fallback a canvas (algunos Android antiguos)
      try {
        canvas.width = videoEl.videoWidth || videoEl.clientWidth;
        canvas.height = videoEl.videoHeight || videoEl.clientHeight;
        if (canvas.width && canvas.height && ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const res2 = await detector.detect(canvas as unknown as CanvasImageSource);
          if (res2 && res2.length) {
            const raw = (res2[0] as any).rawValue || "";
            if (raw) {
              stopped = true;
              onDetected(raw);
              return;
            }
          }
        }
      } catch {}
    }
  }

  const raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    try { cancelAnimationFrame(raf); } catch {}
  };
}
