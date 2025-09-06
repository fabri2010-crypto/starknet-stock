// src/lib/camera.js
// Drop-in helpers to control camera selection, avoid ultra-wide by default,
// remember the user choice, and hide overlay until video is playing.

let _stream = null;
let _userLocked = false;  // set to true when user selects a camera explicitly

const STORAGE_KEY = "scannerDeviceId";

/** Stop any active MediaStream */
export function stopCamera() {
  try {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
    }
  } catch (e) {
    // ignore
  }
  _stream = null;
}

/** Attach MediaStream to a <video id="scanner"> and play */
async function attachToVideo(stream) {
  const video = document.querySelector("video#scanner");
  if (!video) throw new Error('No <video id="scanner"> found.');
  video.srcObject = stream;
  await video.play();
  _wireOverlay(video);
}

/** Internal: getUserMedia with either deviceId or facingMode */
async function _getStream(deviceId) {
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } } }
    : { video: { facingMode: { exact: "environment" } } };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

/** Start camera with specific deviceId (or default back camera if not provided) */
export async function startCamera(deviceId) {
  stopCamera();
  _stream = await _getStream(deviceId);
  await attachToVideo(_stream);
}

/** Called when the user selects a camera in your <select>. */
export async function onCameraSelect(deviceId) {
  _userLocked = true;
  if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
  await startCamera(deviceId);
}

/** List available cameras (after permission) */
export async function listCameras() {
  // ensure labels are available
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (e) {
    // permission might already be granted
  }
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === "videoinput");
}

/** Pick a back camera that is NOT ultra-wide if possible */
export async function pickNonUltraWide() {
  const cams = await listCameras();
  const backs = cams.filter(c => /back|rear|environment/i.test(c.label));
  const notUltra = backs.find(c => !/\bultra\b|0\.5|wide|macro/i.test(c.label));
  return (notUltra ?? backs[0] ?? cams[0])?.deviceId;
}

/** Initialize camera: try saved deviceId, else smart-pick a non-ultra back camera */
export async function initCamera() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      await startCamera(saved);
      return;
    } catch (e) {
      // Saved device may no longer exist
      console.warn("Saved device failed, falling back:", e);
    }
  }
  const id = await pickNonUltraWide();
  await startCamera(id);
}

/** Optional: your "Probar cámaras automáticamente" can call this.
 * If user already selected a camera, this will do nothing.
 */
export async function autoProbeCameras() {
  if (_userLocked) return; // respect user's choice
  const cams = await listCameras();
  for (const cam of cams) {
    if (_userLocked) return; // user changed while probing
    try {
      await startCamera(cam.deviceId);
      // You could try decoding a frame here and continue if it fails.
      // We only start the first that works.
      return;
    } catch (e) {
      // try next
      continue;
    }
  }
}

/** Overlay: hide until video is actually playing */
function _wireOverlay(video) {
  const overlay = document.querySelector("#scanner-overlay");
  if (!overlay) return;
  const hide = () => overlay.classList.add("scanner-overlay-hidden");
  const show = () => overlay.classList.remove("scanner-overlay-hidden");
  // start hidden until playing
  hide();
  video.removeEventListener("playing", show);
  video.addEventListener("playing", show, { once: true });
  video.addEventListener("pause", hide);
  video.addEventListener("ended", hide);
}

// Convenience to expose user lock state in case you need it elsewhere
export function isUserLocked() {
  return _userLocked;
}