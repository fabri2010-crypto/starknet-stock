// src/utils/camera.ts
export type CameraPick = {
  deviceId?: string;
  label?: string;
};

export async function ensureLabels(): Promise<void> {
  // Algunas veces los labels vienen vacíos hasta que hay un getUserMedia inicial
  await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(stream => stream.getTracks().forEach(t => t.stop()))
    .catch(() => {});
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  await ensureLabels();
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

/**
 * Intenta elegir la cámara trasera "normal" evitando ultra-wide/macro.
 * Si no puede, devuelve la primera que parezca trasera.
 */
export async function pickBackCamera(): Promise<CameraPick> {
  const cams = await listVideoInputs();

  // Heurísticas por label (Samsung/Pixel/otros)
  const backish = cams.filter(d =>
    /back|rear|environment/i.test(d.label) || /wide|0\.5|ultra/i.test(d.label)
  );

  // 1) preferimos "environment" que NO diga ultra/wide/0.5/macro
  const normal = backish.find(d => !/ultra|wide|0\.5|macro/i.test(d.label));
  if (normal) return { deviceId: normal.deviceId, label: normal.label };

  // 2) si no hay, tomamos la que diga back/rear/environment (aunque sea wide)
  if (backish[0]) return { deviceId: backish[0].deviceId, label: backish[0].label };

  // 3) fallback: cualquier cámara
  if (cams[0]) return { deviceId: cams[0].deviceId, label: cams[0].label };

  return {};
}

/** Aplica zoom 1× y enfoque continuo si el dispositivo lo permite */
export async function applyTrackTuning(track: MediaStreamTrack) {
  const caps: any = track.getCapabilities?.() || {};
  const adv: any[] = [];
  if (caps.zoom && typeof caps.zoom.min === 'number') {
    // muchos Samsung exponen zoom lógico: 0.5 (ultra), 1, 2...
    const oneX = Math.max(1, caps.zoom.min);
    adv.push({ zoom: oneX });
  }
  if (caps.focusMode && caps.focusMode.includes('continuous')) {
    adv.push({ focusMode: 'continuous' });
  }
  if (adv.length) {
    try { await track.applyConstraints({ advanced: adv }); } catch {}
  }
}

/** Inicia stream con varias estrategias para evitar gran angular */
export async function startVideoStream(deviceId?: string): Promise<MediaStream> {
  const base = {
    audio: false,
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 }
    } as MediaTrackConstraints
  };

  // 1) si tenemos deviceId, vamos directo
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        ...base,
        video: { ...base.video, deviceId: { exact: deviceId } }
      });
    } catch {}
  }

  // 2) “environment” exact
  try {
    return await navigator.mediaDevices.getUserMedia({
      ...base,
      video: { ...base.video, facingMode: { exact: 'environment' } }
    });
  } catch {}

  // 3) “environment” preferido
  return await navigator.mediaDevices.getUserMedia({
    ...base,
    video: { ...base.video, facingMode: 'environment' }
  });
}
