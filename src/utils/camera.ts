/**
 * camera.ts
 * Utilidades para gestionar cámaras en móviles evitando la gran angular/macro
 * y aplicando un tuning seguro (zoom 1× + focus continuo) cuando es posible.
 */

export type VideoPick = { deviceId?: string; label?: string };

export type CameraChoice = {
  deviceId: string;
  label: string;
};

const BAD_KEYWORDS = [
  "ultra",
  "wide",
  "ultrawide",
  "0.5",
  "macro",
  "depth",
  "tof",
  "fisheye",
];

function looksBack(label: string) {
  const s = label.toLowerCase();
  return (
    s.includes("back") ||
    s.includes("rear") ||
    s.includes("environment") ||
    s.includes("trás") ||
    s.includes("trasera")
  );
}

function looksBad(label: string) {
  const s = label.toLowerCase();
  return BAD_KEYWORDS.some((k) => s.includes(k));
}

/** Lista ordenada de cámaras de atrás, priorizando la "normal" sobre ultra‑wide/macro */
export async function listBackCameras(): Promise<CameraChoice[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const vids = all.filter((d) => d.kind === "videoinput") as MediaDeviceInfo[];

  // Si no hay labels (iOS/Android sin permiso), devolvemos tal cual.
  // El permiso se consigue pidiendo getUserMedia antes.
  const withLabels = vids.filter((v) => !!v.label);

  const scored = withLabels.map((v) => {
    const label = v.label || "";
    const back = looksBack(label) ? 2 : 0;
    const normal = back && !looksBad(label) ? 2 : 0;
    const penalty = looksBad(label) ? -2 : 0;
    // Score mayor = mejor candidata
    const score = back + normal + penalty;
    return { deviceId: v.deviceId, label: label.trim(), score };
  });

  // Si no hay labels, mejor devolver cualquier video input
  if (scored.length === 0) {
    return vids.map((v) => ({ deviceId: v.deviceId, label: v.label || "" }));
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ deviceId, label }) => ({ deviceId, label }));
}

/** Elige la mejor cámara trasera "normal" */
export async function pickBackCamera(): Promise<VideoPick> {
  try {
    // En algunos dispositivos, pedir permisos primero desbloquea los labels
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {}
    const backs = await listBackCameras();
    if (backs.length > 0) return { deviceId: backs[0].deviceId, label: backs[0].label };
  } catch {}
  // Fallback genérico (environment)
  return { };
}

/** Abre el stream con constraints adecuados para escanear */
export async function startVideoStream(
  pick?: string
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      // Evitar que el SO elija gran angular por "preferencia de FOV"
      // (forzando sin exactitud: el track tuning corregirá después).
      advanced: [{ zoom: 1 } as any],
      deviceId: pick ? { exact: pick } : undefined,
    }
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

/** Aplica zoom 1× y enfocado continuo cuando está soportado */
export async function applyTrackTuning(track: MediaStreamTrack) {
  try {
    const capabilities = (track.getCapabilities?.() || {}) as any;
    const settings = (track.getSettings?.() || {}) as any;

    const advanced: any[] = [];

    if ("zoom" in capabilities) {
      let z = 1;
      const { min, max } = capabilities.zoom;
      if (typeof min === "number" && typeof max === "number") {
        // clamp to [min, max]
        z = Math.min(max, Math.max(min, 1));
      }
      advanced.push({ zoom: z });
    }

    if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
      if (capabilities.focusMode.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      } else if (capabilities.focusMode.includes("single-shot")) {
        advanced.push({ focusMode: "single-shot" });
      }
    }

    // Evitar balances raros
    if (capabilities.whiteBalanceMode && Array.isArray(capabilities.whiteBalanceMode)) {
      if (capabilities.whiteBalanceMode.includes("continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" });
      }
    }

    if (advanced.length) {
      await track.applyConstraints({ advanced });
    }
  } catch (e) {
    // Silencioso: mejor no romper la UX si el dispositivo no soporta esto
    console.debug("Track tuning skipped", e);
  }
}
