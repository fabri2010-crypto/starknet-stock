// Declaraciones sueltas para que TS no rompa el build si faltan tipos

interface BarcodeDetectorConstructor {
  new (opts: { formats: readonly string[] }): BarcodeDetectorInstance;
}

interface BarcodeDetectorInstance {
  detect(src: any): Promise<Array<{ rawValue: string }>>;
}

declare var BarcodeDetector: BarcodeDetectorConstructor | undefined;

// (opcional) si tu proyecto usa path aliases, podés ajustar aquí.
