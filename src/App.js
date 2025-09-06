import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const STORAGE_KEY = "starknet_stock_app";
const CAM_KEY = "starknet_stock_camId";

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
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

function toDateInputValue(date) {
  const d = new Date(date); const pad = (n)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

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

  const inventoryBySerial = useMemo(()=>{
    const m = new Map(); data.inventory.forEach(it=>m.set(it.serial.trim(),it)); return m;
  },[data.inventory]);

  const registerIngreso = ({ date, serial, product, category, qty, location, responsible, notes }) => {
    setData((d) => {
      const exists = d.inventory.find((i) => i.serial.trim() === (serial||"").trim());
      let inventory;
      if (exists) {
        inventory = d.inventory.map((i) =>
          i.serial.trim() === (serial||"").trim()
            ? { ...i, product: i.product || product, category: i.category || category, location: location || i.location, stock: (Number(i.stock || 0) + Number(qty || 0)) }
            : i
        );
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
      if (newMov.type === "Entrega") {
        inv = d.inventory.map((it) => it.serial === mov.serial ? { ...it, stock: Math.max(0, (+it.stock||0) - (+mov.qty||0)) } : it );
      }
      if (newMov.type === "Devolución") {
        inv = d.inventory.map((it) => it.serial === mov.serial ? { ...it, stock: (+it.stock||0) + (+mov.qty||0) } : it );
      }
      return { ...d, movements, inventory: inv };
    });
  };

  return (
    <div style={{minHeight:'100vh', background:'var(--gray)'}}>
      <div className="container">
        <div className="header">
          <div className="brand">
            <img src="/logo-starknet.png" className="logo" alt="STARKNET"/>
            <div>
              <strong>STARKNET</strong><div className="badge">INTERNET EN EL AIRE</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:13,color:'#475569'}}>Usuario</span>
            <select className="input" value={currentUser} onChange={e=>handleUserChange(e.target.value)}>
              {data.settings.users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
          </div>
        </div>

        <div className="tabs">
          {["inventario","ingreso","movimientos","reportes","ajustes"].map(t=>(
            <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>
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

// -------- Ingreso con cámara: selector + forzar trasera + torch + recordar cámara ----------
function Ingreso({ categories, registerIngreso }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(localStorage.getItem(CAM_KEY) || "");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [torch, setTorch] = useState(false);
  const streamRef = useRef(null);

  const [form, setForm] = useState({
    date: toDateInputValue(new Date()),
    serial: "", product: "", category: categories[0] || "", qty: 1, location: "", responsible: "", notes: ""
  });

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter(d => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId) {
        const back = cams.find(d => /back|rear|environment|trás|atrás/i.test(d.label || ""));
        const pick = (back || cams[0] || {}).deviceId || "";
        setDeviceId(pick);
      }
    } catch(e) {
      setScanError("Sin permiso de cámara. Activala en los permisos del navegador.");
    }
  };

  useEffect(() => { loadDevices(); return () => stopScan(); }, []);
  useEffect(() => { if (deviceId) localStorage.setItem(CAM_KEY, deviceId); }, [deviceId]);

  const startScan = async () => {
    setScanError("");
    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      setScanning(true);
      if (deviceId) {
        await readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, onResult);
      } else {
        await readerRef.current.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, onResult);
      }
      // guardar stream para torch
      streamRef.current = videoRef.current.srcObject;
    } catch (e) {
      setScanning(false);
      setScanError("No pude iniciar la cámara. Probá el botón Forzar trasera o el modo Foto.");
      alert("DEBUG ▶ " + (e?.name || "") + ": " + (e?.message || e));
    }
  };

  const forceBack = async () => {
    setScanError("");
    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      setScanning(true);
      await readerRef.current.decodeFromConstraints(
        { video: { facingMode: { exact: "environment" } } },
        videoRef.current,
        onResult
      );
      streamRef.current = videoRef.current.srcObject;
    } catch (e) {
      setScanning(false);
      setScanError("No pude forzar la trasera. Elegí otra en el selector o usá el modo Foto.");
      alert("DEBUG ▶ " + (e?.name || "") + ": " + (e?.message || e));
    }
  };

  const toggleTorch = async () => {
    try {
      const stream = streamRef.current || videoRef.current?.srcObject;
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) { alert("Tu cámara no expone linterna (torch)."); return; }
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch (e) {
      alert("No pude activar linterna: " + (e?.message || e));
    }
  };

  const onResult = (result, err, controls) => {
    if (result) {
      const text = result.getText();
      setForm(f => ({ ...f, serial: text }));
      try { navigator.vibrate && navigator.vibrate(100); } catch {}
      controls.stop();
      stopScan();
    }
  };

  const stopScan = () => {
    try { readerRef.current?.reset(); } catch {}
    try {
      const stream = videoRef.current && videoRef.current.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
    streamRef.current = null;
    setTorch(false);
    setScanning(false);
  };

  // --- Fallback: Escanear desde foto ---
  const fileInputRef = useRef(null);
  const triggerPhoto = () => fileInputRef.current && fileInputRef.current.click();
  const onPhotoPicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setScanError("");
    try {
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector();
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        if (codes && codes[0]) { setForm(f => ({ ...f, serial: codes[0].rawValue })); e.target.value=""; return; }
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        try {
          const reader = new BrowserMultiFormatReader();
          const result = await reader.decodeFromImage(img);
          setForm(f => ({ ...f, serial: result.getText() }));
        } catch { setScanError("No se detectó código en la foto."); }
        URL.revokeObjectURL(url);
        e.target.value="";
      };
      img.onerror = () => { setScanError("No pude leer la imagen."); URL.revokeObjectURL(url); e.target.value=""; };
      img.src = url;
    } catch (err) {
      setScanError("Error leyendo la foto: " + (err?.message || err));
      e.target.value="";
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if(!form.serial) return alert("Escaneá o escribí el Nº de serie");
    registerIngreso({
      date: form.date, serial: form.serial.trim(), product: form.product.trim(),
      category: form.category, qty: Number(form.qty||0),
      location: form.location.trim(), responsible: form.responsible.trim(), notes: form.notes.trim()
    });
    setForm(f=>({ ...f, serial:"", product:"", qty:1, notes:"" }));
  };

  return (
    <div className="card">
      <h2 style={{marginBottom:8}}>Ingreso de material</h2>

      {scanning && <video ref={videoRef} autoPlay playsInline muted style={{width:"100%",borderRadius:12,marginBottom:10,background:"#000"}} />}
      {!scanning && scanError && <div className="bad" style={{marginBottom:8}}>{scanError}</div>}

      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <button className="btn btn-primary" onClick={startScan} disabled={scanning}>Escanear (video)</button>
        <button className="btn btn-ghost" onClick={forceBack} disabled={scanning}>Forzar trasera</button>
        {scanning && <button className="btn btn-ghost" onClick={toggleTorch}>{torch?"Apagar linterna":"Linterna"}</button>}
        {scanning && <button className="btn btn-ghost" onClick={stopScan}>Detener</button>}
        <select className="input" value={deviceId} onChange={e=>setDeviceId(e.target.value)} style={{minWidth:220}}>
          <option value="">(Elegir cámara)</option>
          {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
        </select>
        <button className="btn btn-orange" type="button" onClick={triggerPhoto}>Escanear con foto</button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={onPhotoPicked}/>
      </div>

      <form className="grid grid-3" onSubmit={onSubmit}>
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
        Si no te ofrece “trasera” en el selector, usá <b>Forzar trasera</b>. Si aún así falla, <b>Escanear con foto</b> abre la cámara nativa y decodifica la imagen.
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
      <form className="grid grid-3" onSubmit={(e)=>onSubmit(e, "Entrega")}>
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
      <table className="table">
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
