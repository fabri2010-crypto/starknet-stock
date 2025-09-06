// Utilidades para elegir cámara "normal" trasera y lanzar Quagga en vivo
import Quagga from "@ericblade/quagga2";

/** Palabras que NO queremos (gran angular, macro, depth, etc.) */
const BAD_WORDS = ["ultra", "wide", "gran", "macro", "depth", "tele", "mono"];
/** Pistas para cámara trasera "normal" */
const GOOD_REAR = ["back", "rear", "environment"];

/** Lista de dispositivos de vídeo */
export async function listVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter(d => d.kind === "videoinput");
}

/** Devuelve el deviceId de la mejor cámara trasera NO gran angular si es posible */
export async function pickRearNormalDevice() {
  const devices = await listVideoDevices();
  if (!devices.length) return null;

  // 1) Preferir etiquetas que apunten a trasera
  const rear = devices.filter(d => {
    const L = (d.label || "").toLowerCase();
    return GOOD_REAR.some(k => L.includes(k));
  });

  // 2) De ésas, quitar wide/macro/etc.
  const rearClean = rear.filter(d => {
    const L = (d.label || "").toLowerCase();
    return !BAD_WORDS.some(k => L.includes(k));
  });

  if (rearClean.length) return rearClean[0].deviceId;
  if (rear.length) return rear[0].deviceId;

  // 3) Si no se puede, cualquier cámara que no sea "wide"
  const clean = devices.filter(d => {
    const L = (d.label || "").toLowerCase();
    return !BAD_WORDS.some(k => L.includes(k));
  });

  if (clean.length) return clean[0].deviceId;

  // 4) Último recurso: la primera
  return devices[0].deviceId;
}

/** Arranca Quagga en vivo sobre un target DOM */
export async function startLiveBarcode({
  target,          // HTMLElement donde Quagga dibuja el <video>
  deviceId,        // deviceId elegido
  onDetected,      // callback(resultText)
  readers = ["code_128_reader","ean_reader","ean_8_reader","code_39_reader"]
}) {
  if (!target) throw new Error("startLiveBarcode: target DOM requerido");

  return new Promise((resolve, reject) => {
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target,
        constraints: {
          deviceId,
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16/9 }
        }
      },
      decoder: { readers },
      locator: { patchSize: "medium", halfSample: true },
      locate: true,
      numOfWorkers: 0   // móvil: 0 evita líos con workers
    }, (err) => {
      if (err) return reject(err);

      Quagga.onDetected((res) => {
        const code = res?.codeResult?.code;
        if (code) onDetected?.(code);
      });

      Quagga.start();
      resolve();
    });
  });
}

export function stopLiveBarcode() {
  try {
    Quagga.offDetected(); // en caso de estar registrado
  } catch {}
  try {
    Quagga.stop();
  } catch {}
}

