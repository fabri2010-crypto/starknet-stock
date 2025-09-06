import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const STORAGE_KEY = "starknet_stock_app";
const CAM_KEY = "starknet_stock_camId";

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { const item = window.localStorage.getItem(key); return item ? JSON.parse(item) : initialValue; } catch { return initialValue; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

const seed = {
  inventory: [],
  movements: [],
  settings: {
    categories: ["Cámaras","Routers","Switches","Fibra Óptica","Antenas","Accesorios","Otros"],
    people: ["Cliente A","Cliente B","Juan Pérez","María López","Equipo Técnico"],
    users: [{ name:"Fabricio", pin:"1234" }, { name:"Matias", pin:"2345" }, { name:"Daniele", pin:"3456" }],
  },
};

function toDateInputValue(date) { const d=new Date(date); const pad=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export default function App(){
  const [data,setData] = useLocalStorage(STORAGE_KEY, seed);
  const [tab,setTab] = useState("ingreso");
  const [currentUser, setCurrentUser] = useState("Fabricio");

  const handleUserChange = (next) => {
    const u = data.settings.users.find(x=>x.name===next);
    const entered = window.prompt(`Ingresá el PIN de ${next}`);
    if(!u) return alert("Usuario inválido");
    if(entered === u.pin){ setCurrentUser(next); } else { alert("PIN incorrecto"); }
  };

  const inventoryBySerial = useMemo(()=>{ const m=new Map(); data.inventory.forEach(it=>m.set(it.serial.trim(),it)); return m; },[data.inventory]);

  const registerIngreso = ({ date, serial, product, category, qty, location, responsible, notes }) => {
    setData((d) => {
      const exists = d.inventory.find((i) => i.serial.trim() === (serial||"").trim());
      let inventory;
      if (exists) {
        inventory = d.inventory.map((i) => i.serial.trim() === (serial||"").trim()
          ? { ...i, product: i.product || product, category: i.category || category, location: location || i.location, stock: (Number(i.stock || 0) + Number(qty || 0)) }
          : i);
      } else {
        inventory = [ ...d.inventory, { serial, product, category, stock: Number(qty || 0), location, notes: notes || "" } ];
      }
      const movements = [ ...d.movements, { date, serial, product, person:"INGRESO MATERIAL", qty:Number(qty||0), responsible:responsible||"", notes:notes||"", type:"Ingreso", user: currentUser } ];
      return { ...d, inventory, movements };
    });
  };

  const addMovement = (mov) => {
    const productName = mov.product?.trim() || inventoryBySerial.get(mov.serial)?.product || "";
    const newMov = { ...mov, product: productName, type: mov.type || "Entrega", user: currentUser };
    setData((d) => {
      const movements = [...d.movements, newMov];
      let inv = d.inventory;
      if (newMov.type === "Entrega") { inv = d.inventory.map((it) => it.serial === mov.serial ? { ...it, stock: Math.max(0, (+it.stock||0) - (+mov.qty||0)) } : it ); }
      if (newMov.type === "Devolución") { inv = d.inventory.map((it) => it.serial === mov.serial ? { ...it, stock: (+it.stock||0) + (+mov.qty||0) } : it ); }
      return { ...d, movements, inventory: inv };
    });
  };

  return (
    <div style={{minHeight:'100vh', background:'var(--gray)'}}>
      <div className="container">
        <div className="header">
          <div className="brand">
            <img src="/logo-starknet.png" className="logo" alt="STARKNET"/>
            <div><strong>STARKNET</strong><div className="badge">INTERNET EN EL AIRE</div></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:13,color:'#475569'}}>Usuario</span>
            <select className="input" value={currentUser} onChange={(e)=>handleUserChange(e.target.value)}>
              {data.settings.users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{display:'flex',gap:8,margin:'10px 0'}}>
          {["inventario","ingreso","movimientos","reportes","ajustes"].map(t=>(
            <button key={t} className={`btn ${tab===t?"btn-primary":"btn-ghost"}`} onClick={()=>setTab(t)}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {tab==="inventario" && <div className="card">Inventario UI aquí</div>}
        {tab==="ingreso" && <Ingreso categories={data.settings.categories} registerIngreso={registerIngreso}/>}
        {tab==="movimientos" && <Movements movements={data.movements} addMovement={addMovement}/>}
        {tab==="reportes" && <div className="card">Reportes UI aquí</div>}
        {tab==="ajustes" && <div className="card">Ajustes UI aquí</div>}

        <div className="footer">© StarkNet</div>
      </div>
    </div>
  );
}

// ---------- Ingreso (Live capture por frames con ImageCapture) ----------
function Ingreso({ categories, registerIngreso }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureRef = useRef(null);
  const timerRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    date: toDateInputValue(new Date()),
    serial: "", product: "", category: categories[0] || "", qty: 1, location: "", responsible: "", notes: ""
  });

  // ZXing afinado a 1D
  const makeReader = () => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return new BrowserMultiFormatReader(hints);
  };
  const reader = useMemo(() => makeReader(), []);

  const openStream = async () => {
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 2560 }, height: { ideal: 1440 } // pedimos bien alta
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    // preparar ImageCapture (frames de alta calidad)
    if ("ImageCapture" in window) {
      try {
        captureRef.current = new ImageCapture(track);
      } catch { captureRef.current = null; }
    }

    // autofocus / zoom
    try {
      const caps = track.getCapabilities && track.getCapabilities();
      if (caps && caps.focusMode && caps.focusMode.length) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      }
      if (caps && caps.zoom) {
        const cur = track.getSettings().zoom || caps.zoom.min || 1;
        setZoom(cur);
      }
    } catch {}
  };

  const setZoomConstraint = async (value) => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return;
      await track.applyConstraints({ advanced: [{ zoom: value }] });
      setZoom(value);
    } catch {}
  };

  const toggleTorch = async () => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const caps = track?.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) { alert("Tu cámara no expone linterna (torch)."); return; }
      const current = track.getSettings && track.getSettings().torch;
      await track.applyConstraints({ advanced: [{ torch: !current }] });
      setTorch(!current);
    } catch (e) { alert("No pude activar linterna: " + (e?.message || e)); }
  };

  const offscreen = document.createElement("canvas");
  const ctx = offscreen.getContext("2d");

  const cropROI = (bmpOrVideo) => {
    const w = bmpOrVideo.width || bmpOrVideo.videoWidth;
    const h = bmpOrVideo.height || bmpOrVideo.videoHeight;
    if (!w || !h) return null;
    const rx = Math.floor(w * 0.1), rw = Math.floor(w * 0.8);
    const ry = Math.floor(h * 0.40), rh = Math.floor(h * 0.20);
    offscreen.width = rw; offscreen.height = rh;
    ctx.drawImage(bmpOrVideo, rx, ry, rw, rh, 0, 0, rw, rh);
    return offscreen;
  };

  const decodeOnce = async (canvas) => {
    // 1) BarcodeDetector si está
    if ("BarcodeDetector" in window) {
      try {
        const bd = new window.BarcodeDetector({ formats: ["code_128","code_39","itf","ean_13","ean_8","upc_a"] });
        const codes = await bd.detect(canvas);
        if (codes && codes[0]) return codes[0].rawValue;
      } catch {}
    }
    // 2) ZXing
    try {
      const res = await reader.decodeFromImage(canvas);
      if (res) return res.getText();
    } catch {}
    return null;
  };

  const loopCapture = async () => {
    if (!running) return;
    try {
      let source = null;
      if (captureRef.current?.grabFrame) {
        source = await captureRef.current.grabFrame(); // frame en alta
      }
      const canvas = cropROI(source || videoRef.current);
      if (canvas) {
        const code = await decodeOnce(canvas);
        if (code) {
          setForm(f => ({ ...f, serial: code }));
          try { navigator.vibrate && navigator.vibrate(100); } catch {}
          stop();
          return;
        }
      }
    } catch {}
    timerRef.current = setTimeout(loopCapture, 180); // ~5-6 fps
  };

  const start = async () => {
    setMsg("");
    try {
      await openStream();
      setRunning(true);
      loopCapture();
    } catch (e) {
      setMsg("No pude iniciar la cámara. Revisá permisos.");
      alert("DEBUG ▶ " + (e?.name || "") + ": " + (e?.message || e));
    }
  };

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const s = streamRef.current;
      if (s) s.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
    setRunning(false);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if(!form.serial) return alert("Escaneá o escribí el Nº de serie");
    registerIngreso({ date: form.date, serial: form.serial.trim(), product: form.product.trim(), category: form.category, qty: Number(form.qty||0), location: form.location.trim(), responsible: form.responsible.trim(), notes: form.notes.trim() });
    setForm(f=>({ ...f, serial:"", product:"", qty:1, notes:"" }));
  };

  return (
    <div className="card">
      <h2>Ingreso de material</h2>

      <div className="scan">
        <video ref={videoRef} className="video" autoPlay playsInline muted/>
        <div className="belt"></div>
      </div>
      {msg && <div style={{color:'#b91c1c', marginTop:8}}>{msg}</div>}

      <div className="controls">
        {!running ? <button className="btn btn-primary" onClick={start}>Escanear (video)</button>
                  : <button className="btn btn-ghost" onClick={stop}>Detener</button>}
        {running && <>
          <button className="btn btn-ghost" onClick={()=>setZoomConstraint(Math.max(1, zoom-0.2))}>- Zoom</button>
          <input className="range" type="range" min="1" max="8" step="0.1" value={zoom} onChange={e=>setZoomConstraint(parseFloat(e.target.value))}/>
          <button className="btn btn-ghost" onClick={()=>setZoomConstraint(zoom+0.2)}>+ Zoom</button>
          <button className="btn btn-ghost" onClick={toggleTorch}>{torch?"Apagar linterna":"Linterna"}</button>
        </>}
      </div>

      <form className="grid" onSubmit={onSubmit}>
        <input className="input" placeholder="Nº de serie (escaneado)" value={form.serial} onChange={e=>setForm({...form, serial:e.target.value})}/>
        <input className="input" placeholder="Producto" value={form.product} onChange={e=>setForm({...form, product:e.target.value})}/>
        <select className="input" value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <input type="number" className="input" placeholder="Cantidad" value={form.qty} onChange={e=>setForm({...form, qty:e.target.value})}/>
        <input className="input" placeholder="Ubicación/Depósito" value={form.location} onChange={e=>setForm({...form, location:e.target.value})}/>
        <input className="input" placeholder="Responsable" value={form.responsible} onChange={e=>setForm({...form, responsible:e.target.value})}/>
        <input className="input" placeholder="Notas" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})}/>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-orange" type="submit">Guardar ingreso</button>
        </div>
      </form>

      <p style={{fontSize:12,color:'#64748b',marginTop:10}}>
        Este modo usa <b>ImageCapture.grabFrame()</b> (o el video si no está) para obtener frames de alta calidad y leer <b>Code128/39/ITF/EAN</b> como si fueran fotos, pero en bucle.
      </p>
    </div>
  );
}

function Movements({ movements, addMovement }){
  const [form, setForm] = useState({ date: toDateInputValue(new Date()), serial:"", product:"", person:"", qty:1, responsible:"", notes:"" });
  const onSubmit = (e, type) => {
    e.preventDefault();
    if (!form.serial) return alert("Completá Nº de serie");
    addMovement({ ...form, qty:Number(form.qty||0), type });
    setForm({ ...form, serial:"", product:"", qty:1, notes:"" });
  };
  return (
    <div className="card">
      <h2 style={{marginBottom:8}}>Registrar movimiento</h2>
      <form className="grid" onSubmit={(e)=>onSubmit(e, "Entrega")}>
        <input className="input" placeholder="Nº Serie" value={form.serial} onChange={e=>setForm({...form, serial:e.target.value})}/>
        <input className="input" placeholder="Producto" value={form.product} onChange={e=>setForm({...form, product:e.target.value})}/>
        <input className="input" placeholder="Entregado a" value={form.person} onChange={e=>setForm({...form, person:e.target.value})}/>
        <input type="number" className="input" value={form.qty} onChange={e=>setForm({...form, qty:e.target.value})}/>
        <input className="input" placeholder="Responsable" value={form.responsible} onChange={e=>setForm({...form, responsible:e.target.value})}/>
        <input className="input" placeholder="Notas" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})}/>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-primary" type="submit">Entrega</button>
          <button className="btn btn-orange" type="button" onClick={(e)=>onSubmit(e,"Devolución")}>Devolver mercadería</button>
        </div>
      </form>
      <h3 style={{marginTop:16, marginBottom:8}}>Historial</h3>
      <table style={{width:'100%'}}>
        <thead><tr><th>Fecha</th><th>Nº Serie</th><th>Producto</th><th>Tipo</th><th>Entregado a</th><th>Cant.</th><th>Usuario</th></tr></thead>
        <tbody>
          {movements.map((m,i)=>(
            <tr key={i}><td>{m.date}</td><td>{m.serial}</td><td>{m.product}</td><td>{m.type}</td><td>{m.person}</td><td>{m.qty}</td><td>{m.user}</td></tr>
          ))}
          {movements.length===0 && <tr><td colSpan="7" style={{textAlign:'center',color:'#64748b'}}>Sin movimientos todavía</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
