import React, { useState } from 'react';
import BarcodeScanner from './components/BarcodeScanner';

export default function App(){
  const [lastCode, setLastCode] = useState('');
  const [log, setLog] = useState([]);

  return (
    <div className="app">
      <div className="card">
        <h2>STARKNET STOCK — Escáner (cámara trasera principal)</h2>
        <div className="content">
          <p>Forzado a la cámara trasera <span className="badge">no ultra-wide</span>. Si tu equipo tiene varias, podrás elegir manualmente. ROI ajustado y lectura en vivo.</p>
          <BarcodeScanner
            onDetected={(code)=>{
              setLastCode(code);
              setLog((l)=>[`${new Date().toLocaleTimeString()} — ${code}`, ...l].slice(0,50));
            }}
          />
          <p className="mono">Último código: <span className="success">{lastCode || '—'}</span></p>
          <details>
            <summary>Ver últimos 50</summary>
            <ul>
              {log.map((l,i)=>(<li key={i} className="mono">{l}</li>))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
