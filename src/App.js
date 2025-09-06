import React, { useEffect, useMemo, useRef, useState } from "react";
import Quagga from "@ericblade/quagga2";

const STORAGE_KEY = "starknet_stock_app";
const CAM_KEY = "starknet_stock_camId";

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { const item = window.localStorage.getItem(key); return item ? JSON.parse(item) : initialValue; } catch { return initialValue; }
  });
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

// src/App.js
import React, { useState } from "react";
import VideoScanner from "./lib/VideoScanner";

function App() {
  const [ultimo, setUltimo] = useState("");

  return (
    <div>
      {/* === BLOQUE TEMPORAL DE PRUEBA === */}
      <VideoScanner onDetected={(code) => {
        setUltimo(code);
        // Si tenés un input para “Nº de serie (escaneado)”, lo podés setear así:
        const serial = document.querySelector('input[name="serial"], input[placeholder*="serie"], input[id*="serie"]');
        if (serial) serial.value = code;
      }} />
      <p style={{marginTop:8}}>Último código: <b>{ultimo}</b></p>
      {/* === FIN BLOQUE TEMPORAL === */}

      {/* ... aquí continúa tu app existente ... */}
    </div>
  );
}

export default App;

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

function Ingreso({ categories, registerIngreso }) {
  const containerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(localStorage.getItem(CAM_KEY) || "");
  const [friendly, setFriendly] = useState("");

  const [form, setForm] = useState({
    date: toDateInputValue(new Date()),
    serial: "", product: "", category: categories[0] || "", qty: 1, location: "", responsible: "", notes: ""
  });

  useEffect(() => {
    // pedir permisos y enumerar cámaras con etiquetas
    const boot = async () => {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
        tmp.getTracks().forEach(t=>t.stop());
      } catch {}
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter(d=>d.kind==="videoinput");
      setDevices(cams);
      // auto-pick: back SIN ultra/macro/depth
      const back = cams.filter(d => /back|rear|environment/i.test(d.label));
      const notWide = back.filter(d => !/wide|ultra|macro|depth/i.test(d.label));
      const pick = (notWide[0] || back[0] || cams[0] || {}).deviceId || "";
      const name = (notWide[0] || back[0] || cams[0] || {}).label || "";
      setFriendly(name);
      if (!deviceId) setDeviceId(pick);
    };
    boot();
    return () => stop();
  }, []);

  useEffect(()=>{
    const name = devices.find(d=>d.deviceId===deviceId)?.label || "";
    setFriendly(name);
    if (deviceId) localStorage.setItem(CAM_KEY, deviceId);
  }, [deviceId, devices]);

  const quaggaConfigFor = (devId) => ({
    inputStream: {
      type: "LiveStream",
      target: containerRef.current,
      constraints: {
        deviceId: devId ? { exact: devId } : undefined,
        facingMode: devId ? undefined : "environment",
        width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 4/3 }
      },
      area: { top: "35%", right: "10%", left: "10%", bottom: "35%" }
    },
    locator: { patchSize: "x-large", halfSample: true },
    decoder: {
      readers: ["code_128_reader","code_39_reader","itf_reader","ean_reader","ean_8_reader","upc_reader"],
      multiple: false
    },
    locate: true,
    frequency: 12
  });

  const startWith = async (devId) => {
    setMessage("");
    try {
      await Quagga.init(quaggaConfigFor(devId));
      Quagga.start();
      setRunning(true);
      Quagga.onProcessed(drawOverlay);
      Quagga.onDetected(onDetected);
    } catch (e) {
      setMessage("Esa cámara falló. Probá otra en el selector o usá 'Probar automáticamente'.");
    }
  };

  const drawOverlay = (result) => {
    const ctx = Quagga.canvas.ctx.overlay;
    const canvas = Quagga.canvas.dom.overlay;
    if (!ctx || !canvas) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (result && result.boxes) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      result.boxes.filter(b=>b!==result.box).forEach(b => {
        Quagga.ImageDebug.drawPath(b, { x:0,y:1 }, ctx, { color:"rgba(255,255,255,0.3)", lineWidth:2 });
      });
    }
    if (result && result.box) {
      Quagga.ImageDebug.drawPath(result.box, { x:0,y:1 }, ctx, { color:"#00ff88", lineWidth:3 });
    }
    if (result && result.codeResult && result.codeResult.code) {
      ctx.font="16px monospace"; ctx.fillStyle="#00ff88";
      ctx.fillText(result.codeResult.code, 10, 20);
    }
  };

  const onDetected = (res) => {
    if (res?.codeResult?.code) {
      const code = res.codeResult.code;
      setForm(f => ({ ...f, serial: code }));
      try { navigator.vibrate && navigator.vibrate(100); } catch {}
      stop();
    }
  };

  const stop = () => {
    try { Quagga.stop(); } catch {}
    Quagga.offProcessed(drawOverlay);
    Quagga.offDetected(onDetected);
    setRunning(false);
  };

  const autoTry = async () => {
    setMessage("Probando cámaras… apuntá el código dentro del rectángulo.");
    const order = [...devices];
    // orden preferente: back sin ultra/macro, luego back, luego resto
    order.sort((a,b)=>{
      const score = d => (/back|rear|environment/i.test(d.label)?2:0) + (!/wide|ultra|macro|depth/i.test(d.label)?1:0);
      return score(b)-score(a);
    });
    for (let i=0;i<order.length;i++){
      const d = order[i];
      setFriendly(d.label || `Cam ${i+1}`);
      await startWith(d.deviceId);
      // Esperar 3 segundos a ver si detecta algo
      const ok = await new Promise(resolve=>{
        let hit = false;
        const h = (res)=>{ if(res?.codeResult?.code){ hit=true; resolve(true);} };
        const t = setTimeout(()=>resolve(hit), 3000);
        Quagga.onDetected(h);
        setTimeout(()=>{ Quagga.offDetected(h); clearTimeout(t); }, 3000);
      });
      stop();
      if (ok) { await startWith(d.deviceId); setMessage(""); return; }
    }
    setMessage("No pude leer en vivo. Probá con la cámara principal desde el selector, o usá 'Escanear con foto'.");
  };

  // Fallback imagen con Quagga
  const fileRef = useRef(null);
  const decodeImage = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    Quagga.decodeSingle({
      src: url,
      numOfWorkers: 0,
      inputStream: { size: 1200 },
      decoder: { readers: ["code_128_reader","code_39_reader","itf_reader","ean_reader","ean_8_reader","upc_reader"] }
    }, function (result) {
      if (result && result.codeResult) {
        setForm(f => ({ ...f, serial: result.codeResult.code }));
      } else { alert("No se detectó código en la imagen."); }
      URL.revokeObjectURL(url);
    });
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
        <div id="interactive" ref={containerRef}></div>
        <div className="roi"></div>
      </div>
      {message && <div className="bad" style={{marginTop:8}}>{message}</div>}

      <div className="controls">
        <span className="small">Cámara: <b>{friendly || "(sin nombre)"}</b></span>
        <select className="input" value={deviceId} onChange={e=>setDeviceId(e.target.value)} style={{minWidth:260}}>
          {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
        </select>
        {!running ? <button className="btn btn-primary" onClick={()=>startWith(deviceId)}>Escanear (video)</button>
                  : <button className="btn btn-ghost" onClick={stop}>Detener</button>}
        <button className="btn btn-ghost" onClick={autoTry}>Probar cámaras automáticamente</button>
        <button className="btn btn-orange" onClick={()=>fileRef.current && fileRef.current.click()}>Escanear con foto</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
               onChange={(e)=>decodeImage(e.target.files && e.target.files[0])}/>
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

      <p className="small" style={{marginTop:10}}>
        Esta versión vuelve al motor <b>Quagga2</b> (como la v09), con <b>selector</b> y un botón para <b>probar cámaras automáticamente</b>. El ROI está optimizado para <b>Code128/39/ITF/EAN</b>.
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
