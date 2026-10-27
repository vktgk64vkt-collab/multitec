// Nombre de artículo siempre en el mismo orden: Tipo · Tecnología · Forma · Especificación · Marca · Modelo.
// Cada familia cambia las etiquetas y las opciones sugeridas, no el orden. Todas las casillas se pueden
// escribir a mano y aceptan "N/A" cuando no aplican (se omiten del nombre).

export const NA = 'N/A';

export const CASILLAS = ['tipo', 'tecnologia', 'forma', 'especificacion', 'marca', 'modelo'] as const;
export type Casilla = (typeof CASILLAS)[number];
export type Partes = Record<Casilla, string>;

export interface Familia {
  etiquetas: Record<Casilla, string>;
  tipos: string[];
  tecnologias: string[];
  formas: string[];
  /** Sugerencias según el tipo elegido; '*' es el respaldo. */
  especificaciones: Record<string, string[]>;
  marcas: string[];
  servicio?: boolean; // los artículos de esta familia son servicios (sin stock)
  codigo: string; // prefijo del código único: CCTV-0001
}

export const FAMILIAS: Record<string, Familia> = {
  CCTV: {
    codigo: 'CCTV',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Forma', especificacion: 'Resolución / capacidad', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Cámara', 'NVR', 'DVR', 'XVR', 'Disco duro', 'Fuente de poder', 'Monitor', 'Video balun', 'Caja de conexiones', 'Soporte', 'Lente', 'Kit'],
    tecnologias: ['IP', 'HD-TVI', 'AHD', 'HDCVI', 'Analógica', 'WiFi'],
    formas: ['Turret', 'Bullet', 'Domo', 'PTZ', 'Cubo', 'Ojo de pez', 'Panorámica', 'Mini bullet', 'Oculta'],
    especificaciones: {
      Cámara: ['2MPX', '3MPX', '4MPX', '5MPX', '6MPX', '8MPX'],
      NVR: ['4CH', '8CH', '16CH', '32CH', '64CH'],
      DVR: ['4CH', '8CH', '16CH', '32CH'],
      XVR: ['4CH', '8CH', '16CH', '32CH'],
      'Disco duro': ['1TB', '2TB', '4TB', '6TB', '8TB', '10TB'],
      'Fuente de poder': ['12V 1A', '12V 2A', '12V 5A', '12V 10A', '12V 20A'],
      Monitor: ['19"', '22"', '24"', '32"', '43"'],
      '*': [],
    },
    marcas: ['Hikvision', 'Dahua', 'Uniview', 'Axis', 'Hanwha', 'Ezviz', 'Imou', 'Provision-ISR', 'Western Digital', 'Seagate', 'Genérica'],
  },
  Alarma: {
    codigo: 'ALM',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Montaje', especificacion: 'Zonas / capacidad', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Panel', 'Teclado', 'Sensor de movimiento', 'Contacto magnético', 'Detector de humo', 'Sirena', 'Botón de pánico', 'Control remoto', 'Módulo de expansión', 'Comunicador', 'Batería', 'Fuente de poder', 'Kit'],
    tecnologias: ['Cableada', 'Inalámbrica', 'Híbrida', 'IP / WiFi', 'Celular 4G'],
    formas: ['Pared', 'Techo', 'Esquina', 'Empotrado', 'Sobreponer', 'Interior', 'Exterior'],
    especificaciones: {
      Panel: ['8 zonas', '16 zonas', '32 zonas', '64 zonas'],
      'Sensor de movimiento': ['PIR', 'Dual', 'Inmune a mascotas', 'Cortina'],
      Sirena: ['15W', '30W', '120dB'],
      Batería: ['12V 4Ah', '12V 7Ah', '12V 9Ah'],
      'Fuente de poder': ['12V 2A', '12V 5A'],
      '*': [],
    },
    marcas: ['DSC', 'Honeywell', 'Paradox', 'Ajax', 'Bosch', 'Hikvision', 'Texecom', 'Risco', 'Pima', 'Genérica'],
  },
  'Control de acceso': {
    codigo: 'ACC',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Montaje', especificacion: 'Capacidad / fuerza', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Lector', 'Controlador', 'Cerradura magnética', 'Cerradura eléctrica', 'Cerrojo eléctrico', 'Botón de salida', 'Teclado', 'Terminal biométrica', 'Torniquete', 'Barrera vehicular', 'Intercomunicador', 'Tarjeta', 'Llavero (tag)', 'Fuente de poder'],
    tecnologias: ['RFID 125 kHz', 'Mifare 13.56 MHz', 'Huella', 'Facial', 'PIN', 'Bluetooth', 'Mixta'],
    formas: ['Empotrar', 'Sobreponer', 'Slim (marco)', 'Mullion', 'Gabinete', 'Exterior'],
    especificaciones: {
      'Cerradura magnética': ['300 lb', '600 lb', '1200 lb'],
      Controlador: ['1 puerta', '2 puertas', '4 puertas'],
      'Terminal biométrica': ['1000 usuarios', '3000 usuarios', '10000 usuarios'],
      'Barrera vehicular': ['3 m', '4 m', '6 m'],
      'Fuente de poder': ['12V 3A', '12V 5A'],
      '*': [],
    },
    marcas: ['Hikvision', 'ZKTeco', 'Suprema', 'HID', 'Dahua', 'Paxton', 'Genérica'],
  },
  Redes: {
    codigo: 'RED',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Forma / montaje', especificacion: 'Puertos / capacidad', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Switch', 'Router', 'Access point', 'Firewall', 'Patch panel', 'Rack', 'UPS', 'Inyector PoE', 'Transceptor SFP', 'Radioenlace', 'Antena', 'Servidor', 'Organizador'],
    tecnologias: ['PoE', 'PoE+', 'Gigabit', '10 Gigabit', 'WiFi 5', 'WiFi 6', 'WiFi 6E', 'WiFi 7', 'Fibra óptica', '4G/5G'],
    formas: ['Rack', 'Escritorio', 'Pared', 'Techo', 'Exterior', 'Gabinete', 'Torre'],
    especificaciones: {
      Switch: ['5P', '8P', '16P', '24P', '48P'],
      'Patch panel': ['12P', '24P', '48P'],
      Rack: ['6U', '9U', '12U', '22U', '42U'],
      UPS: ['650VA', '1000VA', '1500VA', '3000VA'],
      '*': [],
    },
    marcas: ['Ubiquiti', 'TP-Link', 'MikroTik', 'Cisco', 'Ruijie', 'Tenda', 'Mercusys', 'D-Link', 'APC', 'Genérica'],
  },
  Domótica: {
    codigo: 'DOM',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Forma / montaje', especificacion: 'Canales / variante', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Hub / Gateway', 'Interruptor', 'Enchufe', 'Sensor', 'Cerradura inteligente', 'Termostato', 'Motor de cortina', 'Timbre con video', 'Control IR', 'Iluminación', 'Bocina inteligente', 'Cámara WiFi', 'Módulo relé', 'Pantalla'],
    tecnologias: ['WiFi', 'Zigbee', 'Z-Wave', 'Bluetooth', 'Matter', 'KNX', 'RF 433 MHz'],
    formas: ['Pared', 'Empotrar', 'Enchufe', 'Riel DIN', 'Techo', 'Sobreponer'],
    especificaciones: {
      Interruptor: ['1 canal', '2 canales', '3 canales', '4 canales'],
      Enchufe: ['10A', '16A'],
      Sensor: ['Movimiento', 'Puerta/ventana', 'Temperatura', 'Humedad', 'Humo', 'Fuga de agua'],
      'Módulo relé': ['1CH', '2CH', '4CH'],
      '*': [],
    },
    marcas: ['Sonoff', 'Shelly', 'Tuya', 'Aqara', 'Philips Hue', 'Lutron', 'Somfy', 'Genérica'],
  },
  Cableado: {
    codigo: 'CAB',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Categoría / tipo de cable', forma: 'Uso', especificacion: 'Medida / presentación', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Cable UTP', 'Cable coaxial', 'Cable de fibra', 'Cable de alarma', 'Cable eléctrico', 'Cable HDMI', 'Patch cord', 'Canaleta', 'Tubería', 'Conector', 'Jack', 'Face plate', 'Caja de paso', 'Amarres'],
    tecnologias: ['Cat5e', 'Cat6', 'Cat6A', 'RG59', 'RG6', 'Monomodo', 'Multimodo', '2 hilos', '4 hilos', '6 hilos', 'THHN'],
    formas: ['Interior', 'Exterior', 'Blindado', 'Plenum', 'Aéreo', 'Subterráneo', 'Sólido', 'Flexible'],
    especificaciones: {
      Canaleta: ['20x10mm', '25x25mm', '40x25mm'],
      Tubería: ['1/2"', '3/4"', '1"'],
      Conector: ['RJ45', 'BNC', 'F', 'Jack DC', 'Terminal'],
      '*': ['100M', '305M', '500M', '1000M', 'Por metro'],
    },
    marcas: ['Panduit', 'Belden', 'Nexxt', 'Commscope', 'Siemon', 'Genérica'],
  },
  Energía: {
    codigo: 'ENE',
    etiquetas: { tipo: 'Tipo', tecnologia: 'Tecnología', forma: 'Forma / montaje', especificacion: 'Capacidad', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['UPS', 'Batería', 'Panel solar', 'Inversor', 'Regulador de voltaje', 'Planta eléctrica', 'Cargador', 'Fuente de poder'],
    tecnologias: ['AGM', 'Gel', 'Litio', 'Plomo ácido', 'Online', 'Offline', 'Línea interactiva'],
    formas: ['Torre', 'Rack', 'Pared', 'Techo'],
    especificaciones: {
      UPS: ['650VA', '1000VA', '1500VA', '3000VA'],
      Batería: ['12V 4Ah', '12V 7Ah', '12V 9Ah', '12V 100Ah'],
      '*': [],
    },
    marcas: ['APC', 'CDP', 'Forza', 'Tripp Lite', 'Victron', 'Genérica'],
  },
  Servicios: {
    codigo: 'SRV',
    etiquetas: { tipo: 'Servicio', tecnologia: 'Sistema', forma: 'Unidad de cobro', especificacion: 'Alcance', marca: 'Marca', modelo: 'Modelo' },
    tipos: ['Instalación', 'Configuración', 'Programación', 'Mantenimiento', 'Visita técnica', 'Diagnóstico', 'Canalización', 'Cableado', 'Capacitación', 'Soporte / garantía', 'Mano de obra'],
    tecnologias: ['CCTV', 'Alarma', 'Control de acceso', 'Redes', 'Domótica', 'Cableado', 'Energía', 'General'],
    formas: ['Por punto', 'Por hora', 'Por metro', 'Por equipo', 'Por visita', 'Global', 'Mensual'],
    especificaciones: { '*': ['Interior', 'Exterior', 'Altura', 'Estándar'] },
    marcas: [],
    servicio: true,
  },
};

export const NOMBRES_FAMILIAS = Object.keys(FAMILIAS);

export const PARTES_VACIAS: Partes = { tipo: '', tecnologia: '', forma: '', especificacion: '', marca: '', modelo: '' };

/** Sugerencias de la casilla de especificación según el tipo ya elegido. */
export function sugerenciasEspecificacion(f: Familia, tipo: string): string[] {
  return f.especificaciones[tipo] ?? f.especificaciones['*'] ?? [];
}

/**
 * Nombre estándar: partes en orden, sin las "N/A" ni las vacías. Ej. "Cámara IP Turret 4MPX Hikvision DS-2CD2143G2-I".
 * Devuelve null si falta responder alguna casilla o el tipo es N/A (hay que decidir cada casilla a propósito).
 */
export function armarNombre(p: Partes): string | null {
  const v = CASILLAS.map((c) => p[c].trim());
  if (v.some((x) => x === '') || v[0].toUpperCase() === NA) return null;
  return v.filter((x) => x.toUpperCase() !== NA).join(' ');
}

export const PREFIJO_GENERICO = 'GEN';

export function prefijoCodigo(familia: string | null): string {
  return (familia && FAMILIAS[familia]?.codigo) || PREFIJO_GENERICO;
}

// Rellena el código de los artículos que no lo tienen (migración y respaldos viejos): PREFIJO-0001 en orden de id.
const CASO = (alias: string) =>
  `CASE ${alias}.categoria ${Object.entries(FAMILIAS).map(([n, f]) => `WHEN '${n}' THEN '${f.codigo}'`).join(' ')} ELSE '${PREFIJO_GENERICO}' END`;
export const CODIGOS_SQL = `UPDATE catalogo SET codigo = ${CASO('catalogo')} || '-' || printf('%04d',
  (SELECT COUNT(*) FROM catalogo c WHERE c.id <= catalogo.id AND ${CASO('c')} = ${CASO('catalogo')})) WHERE codigo IS NULL`;
