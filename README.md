# STARKNET STOCK — Scanner Fix (React + Quagga2)

## Requisitos
- Node 18+
- `npm install --legacy-peer-deps` (CRA 5 + quagga2)

## Comandos
```bash
npm install --legacy-peer-deps
npm start
# o
npm run build
```

## Qué cambia
- Selección automática de **cámara trasera principal** evitando **ultra-wide/tele/macro** por heurística de nombre.
- Opción manual para seleccionar otra cámara si el dispositivo tiene múltiples módulos traseros.
- **ROI** centrado para mejorar lectura en vivo.
- Soporte de **linterna** (si el track lo soporta).
