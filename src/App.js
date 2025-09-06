import React, { useEffect, useMemo, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const STORAGE_KEY = "starknet_stock_app";

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
  const [tab,setTab] = useState("inventario");
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

  const addMovement = (mov) => {
    const productName = mov.product?.trim() || inventoryBySerial.get(mov.serial)?.product || "";
    const newMov = { ...mov, product: productName, type: mov.type || "Entrega", user: currentUser };
    setData(d=>{
      const movements = [...d.movements, newMov];
      let inv = d.inventory;
      if(newMov.type==="Entrega"){
        inv = d.inventory.map(it => it.serial===mov.serial ? { ...it, stock: Math.max(0,(+it.stock||0) - (+mov.qty||0)) } : it);
      }
      if(newMov.type==="Devolución"){
        inv = d.inventory.map(it => it.serial===mov.serial ? { ...it, stock: (+it.stock||0) + (+mov.qty||0) } : it);
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
        {tab==="ingreso" && <div className="card">Ingreso UI aquí</div>}
        {tab==="movimientos" && <Movements movements={data.movements} addMovement={addMovement}/>}
        {tab==="reportes" && <div className="card">Reportes UI aquí</div>}
        {tab==="ajustes" && <div className="card">Ajustes UI aquí</div>}

        <div className="footer">© StarkNet</div>
      </div>
    </div>
  );
}

function Movements({ movements, addMovement }){
  const [form,setForm] = useState({ date: toDateInputValue(new Date()), serial:"", product:"", person:"", qty:1, responsible:"", notes:"" });
  const onSubmit=(e,type)=>{
    e.preventDefault();
    if(!form.serial) return alert("Completá Nº de serie");
    addMovement({ ...form, qty:+(form.qty||0), type });
    setForm(f=>({ ...f, serial:"", product:"", qty:1, notes:"" }));
  };
  return (
    <div className="card">
      <h2 style={{marginBottom:8}}>Registrar movimiento</h2>
      <form className="grid grid-3" onSubmit={(e)=>onSubmit(e,"Entrega")}>
        <input className="input" placeholder="Nº Serie" value={form.serial} onChange={e=>setForm({...form,serial:e.target.value})}/>
        <input className="input" placeholder="Producto" value={form.product} onChange={e=>setForm({...form,product:e.target.value})}/>
        <input className="input" placeholder="Entregado a" value={form.person} onChange={e=>setForm({...form,person:e.target.value})}/>
        <input type="number" className="input" value={form.qty} onChange={e=>setForm({...form,qty:e.target.value})}/>
        <input className="input" placeholder="Responsable" value={form.responsible} onChange={e=>setForm({...form,responsible:e.target.value})}/>
        <input className="input" placeholder="Notas" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-primary" type="submit">Entrega</button>
          <button className="btn btn-orange" type="button" onClick={(e)=>onSubmit(e,"Devolución")}>Devolver mercadería</button>
        </div>
      </form>
      <h3 style={{marginTop:16,marginBottom:8}}>Historial</h3>
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
