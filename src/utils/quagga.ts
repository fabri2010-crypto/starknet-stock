/**
 * quagga.ts
 * Fallback a Quagga2 cargado desde CDN para no tocar package.json.
 * Solo se ejecuta si BarcodeDetector no está disponible.
 */

export type StopFn = () => void;

type QuaggaType = any;

async function loadQuagga(): Promise<QuaggaType> {
  // Carga dinámica desde jsDelivr. CRA respeta webpackIgnore.
  const mod = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@ericblade/quagga2@2.0.2/+esm");
  return (mod as any).default || mod;
}

export async function startQuagga(
  videoEl: HTMLVideoElement,
  onDetected: (code: string) => void
): Promise<StopFn> {
  const Quagga = await loadQuagga();

  // Quagga usa su propio <video>, así que le pasamos el node contenedor
  // Colocamos un wrapper temporal sobre el elemento video dado.
  const parent = videoEl.parentElement || document.body;
  const placeholder = document.createElement("div");
  placeholder.style.position = "relative";
  placeholder.style.width = videoEl.clientWidth ? `${videoEl.clientWidth}px` : "100%";
  placeholder.style.height = videoEl.clientHeight ? `${videoEl.clientHeight}px` : "300px";
  parent.insertBefore(placeholder, videoEl);
  videoEl.style.display = "none";

  await Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: placeholder,
      constraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    decoder: {
      readers: [
        "code_128_reader",
        "ean_reader",
        "ean_8_reader",
        "code_39_reader",
        "code_93_reader",
        "upc_reader",
        "upc_e_reader",
        "i2of5_reader",
        "codabar_reader",
      ],
    },
    locate: true,
  }, (err: any) => {
    if (err) {
      console.error("Quagga init error", err);
      cleanup();
      return;
    }
    Quagga.start();
  });

  const onDet = (res: any) => {
    const code = res?.codeResult?.code;
    if (code) {
      cleanup();
      onDetected(code);
    }
  };
  Quagga.onDetected(onDet);

  function cleanup() {
    try { Quagga.offDetected(onDet); } catch {}
    try { Quagga.stop(); } catch {}
    try {
      videoEl.style.display = "";
      placeholder.remove();
    } catch {}
  }

  return cleanup;
}
