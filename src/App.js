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
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

const seed = {
  inventory: [],
  movements: [],
  settings: {
    categories: ["Cámaras", "Routers", "Switches", "Fibra Óptica", "Antenas", "Accesorios", "Otros"],
    people: ["Cliente A", "Cliente B", "Juan Pérez", "María López", "Equipo Técnico"],
    users: [{ name: "Fabricio", pin: "1234" }, { name: "Matias", pin: "2345" }, { name: "Daniele", pin: "3456" }],
  },
};

function toDateInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function App() {
  const [data, setData] = useLocalStorage(STORAGE_KEY, seed);
  const [tab, setTab] = useState("inventario");
  const [currentUser, setCurrentUser] = useState("Fabricio");

  const handleUserChange = (nextName) => {
    const u = data.settings.users.find((x) => x.name === nextName);
    const entered = window.prompt(`Ingresá el PIN de ${nextName}`);
    if (!u) return alert("Usuario inválido");
    if (entered === u.pin) {
      setCurrentUser(nextName);
    } else {
      alert("PIN incorrecto");
    }
  };

  const inventoryBySerial = useMemo(() => {
    const map = new Map();
    data.inventory.forEach((it) => map.set(it.serial.trim(), it));
    return map;
  }, [data.inventory]);

  const addMovement = (mov) => {
    const productName = mov.product && mov.product.trim() ? mov.product.trim() : inventoryBySerial.get(mov.serial)?.product || "";
    const newMov = { ...mov, product: productName, type: mov.type || "Entrega", user: currentUser };
    setData((d) => {
      const movements = [...d.movements, newMov];
      let inv = d.inventory;
      if (newMov.type === "Entrega") {
        inv = d.inventory.map((it) => {
          if (it.serial === mov.serial) {
            const newStock = Math.max(0, (parseFloat(it.stock || 0) || 0) - (parseFloat(mov.qty || 0) || 0));
            return { ...it, stock: newStock };
          }
          return it;
        });
      }
      if (newMov.type === "Devolución") {
        inv = d.inventory.map((it) => {
          if (it.serial === mov.serial) {
            return { ...it, stock: (parseFloat(it.stock || 0) || 0) + (parseFloat(mov.qty || 0) || 0) };
          }
          return it;
        });
      }
      return { ...d, movements, inventory: inv };
    });
  };

  return (
    <div style={{minHeight:'100vh', background:'#f9fafb', color:'#0f172a'}}>
      <div style={{maxWidth:960, margin:'0 auto', padding:'16px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h1>STARKNET — Stock por Nº de Serie</h1>
          <select value={currentUser} onChange={(e) => handleUserChange(e.target.value)}>
            {data.settings.users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
          </select>
        </div>
        <div style={{display:'flex', gap:8, margin:'12px 0'}}>
          <button onClick={()=>setTab("inventario")}>Inventario</button>
          <button onClick={()=>setTab("ingreso")}>Ingreso material</button>
          <button onClick={()=>setTab("movimientos")}>Movimientos</button>
          <button onClick={()=>setTab("reportes")}>Reportes</button>
          <button onClick={()=>setTab("ajustes")}>Ajustes</button>
        </div>
        {tab==="inventario" && <div>Inventario UI aquí</div>}
        {tab==="ingreso" && <div>Ingreso UI aquí</div>}
        {tab==="movimientos" && <Movements movements={data.movements} addMovement={addMovement} />}
        {tab==="reportes" && <div>Reportes UI aquí</div>}
        {tab==="ajustes" && <div>Ajustes UI aquí</div>}
      </div>
    </div>
  );
}

function Movements({ movements, addMovement }) {
  const [form, setForm] = useState({ date: toDateInputValue(new Date()), serial:"", product:"", person:"", qty:1, responsible:"", notes:"" });
  const onSubmit = (e, type) => {
    e.preventDefault();
    if (!form.serial) return alert("Completá Nº de serie");
    addMovement({ ...form, qty:Number(form.qty||0), type });
    setForm({ ...form, serial:"", product:"", qty:1, notes:"" });
  };
  return (
    <div>
      <h2>Registrar movimiento</h2>
      <form onSubmit={(e)=>onSubmit(e, "Entrega")}>
        <input placeholder="Nº Serie" value={form.serial} onChange={e=>setForm({...form, serial:e.target.value})}/>
        <input placeholder="Producto" value={form.product} onChange={e=>setForm({...form, product:e.target.value})}/>
        <input placeholder="Entregado a" value={form.person} onChange={e=>setForm({...form, person:e.target.value})}/>
        <input type="number" value={form.qty} onChange={e=>setForm({...form, qty:e.target.value})}/>
        <input placeholder="Responsable" value={form.responsible} onChange={e=>setForm({...form, responsible:e.target.value})}/>
        <input placeholder="Notas" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})}/>
        <button type="submit">Entrega</button>
        <button type="button" onClick={(e)=>onSubmit(e,"Devolución")}>Devolver mercadería</button>
      </form>
      <h3>Historial</h3>
      <ul>
        {movements.map((m,i)=>(<li key={i}>{m.date} — {m.serial} — {m.product} — {m.type} — {m.person} — {m.qty} — {m.user}</li>))}
      </ul>
    </div>
  );
}
