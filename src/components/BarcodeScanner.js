import React, { useEffect, useRef, useState } from 'react';
import Quagga from 'quagga2';
import { pickBestBackCamera } from '../utils/camera';

const SUPPORTED_READERS = [
  'code_128_reader',
  'ean_reader',
  'ean_8_reader',
  'upc_reader',
  'upc_e_reader',
  'code_39_reader',
  'code_93_reader',
  'i2of5_reader',
  'codabar_reader'
];

export default function BarcodeScanner({ onDetected }){
  const videoRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState(false);
  const trackRef = useRef(null);

  useEffect(()=>{
    async function init(){
      try{
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(s=>s.getTracks().forEach(t=>t.stop()));
      }catch(e){ /* permiso puede ser denegado aquí */ }

      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d=>d.kind==='videoinput'));

      // Elegimos la mejor trasera principal
      let best = pickBestBackCamera(all);
      if (!best && all.find(d=>d.kind==='videoinput')) {
        best = all.find(d=>d.kind==='videoinput');
      }
      setCurrentDeviceId(best ? best.deviceId : null);
    }
    init();
  },[]);

  useEffect(()=>{
    if (!currentDeviceId) return;
    start();
    return stop;
    // eslint-disable-next-line
  },[currentDeviceId]);

  async function start(){
    if (running || !currentDeviceId) return;
    setRunning(true);

    // Intento abrir stream manual para fijar deviceId exacto y permitir torch
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: currentDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16/9 },
          facingMode: { ideal: 'environment' },
          advanced: [{ focusMode: 'continuous' }]
        },
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    }catch(err){
      console.error('Error al abrir cámara directa:', err);
    }

    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: videoRef.current,
        constraints: {
          deviceId: currentDeviceId,
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16/9 }
        },
        area: { // ROI — zona central para mejorar lectura y evitar bordes
          top: "20%",
          right: "20%",
          left: "20%",
          bottom: "20%"
        }
      },
      decoder: {
        readers: SUPPORTED_READERS,
        multiple: false
      },
      locate: true,
      frequency: 10 // limita scans/seg para performance
    }, (err)=>{
      if (err) {
        console.error('Quagga init error', err);
        setRunning(false);
        return;
      }
      Quagga.start();
      // Dibujo rectángulos si hace falta
      Quagga.onProcessed(result => {
        // opcional: se podría pintar overlays
      });
      Quagga.onDetected(result => {
        if (!result || !result.codeResult || !result.codeResult.code) return;
        const code = result.codeResult.code;
        onDetected && onDetected(code);
      });
    });
  }

  function stop(){
    if (!running) return;
    try { Quagga.stop(); } catch {}
    if (videoRef.current && videoRef.current.srcObject){
      videoRef.current.srcObject.getTracks().forEach(t=>t.stop());
      videoRef.current.srcObject = null;
    }
    if (trackRef.current){
      try{ trackRef.current.stop(); }catch{}
      trackRef.current = null;
    }
    setRunning(false);
  }

  async function toggleTorch(){
    if (!trackRef.current) return;
    try{
      const caps = trackRef.current.getCapabilities ? trackRef.current.getCapabilities() : {};
      if (caps.torch){
        await trackRef.current.applyConstraints({ advanced: [{ torch: !torch }] });
        setTorch(t => !t);
      }
    }catch(e){
      console.warn('Torch no soportado', e);
    }
  }

  return (
    <div>
      <div className="row" style={{marginBottom: 8}}>
        <select
          value={currentDeviceId || ''}
          onChange={e=>setCurrentDeviceId(e.target.value)}
          title="Elegí la cámara trasera principal"
        >
          {devices.map(d=>(
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Cam ${d.deviceId.slice(0,6)}`}</option>
          ))}
        </select>
        <button className="btn" onClick={running ? stop : start}>
          {running ? 'Detener' : 'Iniciar'}
        </button>
        <button className="btn" onClick={toggleTorch} disabled={!trackRef.current}>
          Linterna {torch ? 'ON' : 'OFF'}
        </button>
        <span className="badge">Dispositivos: {devices.length}</span>
      </div>
      <video ref={videoRef} playsInline muted />
      <p className="warn">Si ves ultra-wide, probá seleccionar otra cámara en el selector. El sistema prioriza “back/main” y evita “ultra wide/tele/macro”.</p>
    </div>
  );
}
