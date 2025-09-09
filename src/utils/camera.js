// Heurística para elegir la cámara trasera principal evitando ultra-wide, macro, tele
export function pickBestBackCamera(devices) {
  const cams = devices.filter(d => d.kind === 'videoinput');
  if (!cams.length) return null;

  const score = (label) => {
    const L = (label || '').toLowerCase();
    let s = 0;
    if (/(back|rear|environment|wide|main)/.test(L)) s += 5;
    if (/(main|wide)/.test(L)) s += 4;
    if (/(pro|o\s?is|stabil)/.test(L)) s += 1;
    // Penalizaciones
    if (/(ultra[-\s]?wide|uw)/.test(L)) s -= 6;
    if (/(tele|zoom)/.test(L)) s -= 4;
    if (/(macro|depth|tof|mono)/.test(L)) s -= 5;
    if (/(front|user|selfie)/.test(L)) s -= 8;
    // preferimos nombres largos que suelen describir el módulo principal
    s += Math.min(3, Math.floor((L.length)/10));
    return s;
  };

  // Si no hay labels (sin permisos), devolvemos el primero y dejamos que facingMode lo intente
  if (!cams.some(c => c.label)) return cams[0];

  const sorted = cams.map(c => ({...c, _score: score(c.label)}))
                     .sort((a,b)=> b._score - a._score);
  return sorted[0];
}
