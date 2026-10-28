import { AvisoEjecucion, useEjecucionIniciada } from '@/bloqueo';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { intentar, mensajeError } from '@/accion';
import { Alert } from '@/alert';
import { aDatosProducto, pareceArticuloNuevo, type BorradorArticulo } from '@/articuloVoz';
import { entenderArticuloConClaude, entenderConClaude, leerClave, leerModoEntender } from '@/claude';
import { crearProducto, type DatosProducto, listarCatalogo, type Producto } from '@/db/catalogo';
import { obtenerOpciones } from '@/db/cotizacion';
import { crearPartida } from '@/db/levantamiento';
import { buscarOCrearCliente } from '@/db/clientes';
import { crearProyecto, nombreAutomatico, TIPOS, type Proyecto } from '@/db/proyectos';
import { tomarImagen } from '@/imagenIA';
import { proyectosConResumen } from '@/db/resumen';
import { IconoMic } from '@/dictado';
import { moneda, precioParaProyecto } from '@/dinero';
import { CASILLAS, FAMILIAS, NA, textoCaracteristicas } from '@/nomenclatura';
import { entenderLocal, normalizar, numerosEnDigitos, separarApodos, type ArticuloPedido, type ResultadoPedido } from '@/pedido';
import { color } from '@/tema';
import { useVoz } from '@/voz';
import { Boton, Campo, Chip, Etiqueta, PROPS_TECLADO, Tarjeta } from '@/ui';

interface Revision {
  clave: number;
  texto: string;
  item: Producto | null;
  cantidad: number;
  area: string;
  alternativas: Producto[];
  manual: boolean; // agregar tal cual se dictó, sin artículo del inventario (queda sin precio)
}

const aArticulo = (p: Producto): ArticuloPedido => ({
  id: p.id,
  nombre: p.nombre,
  apodos: separarApodos(p.apodos),
  tipo: p.tipo,
  extras: textoCaracteristicas(p.f_tipo, p.atributos) || undefined,
});
const capitalizar = (t: string) => t.trim().charAt(0).toUpperCase() + t.trim().slice(1);

/** Palabras de tu inventario que ayudan al reconocimiento de voz a acertar "turret", "Hikvision", tus apodos... */
function palabrasClave(inventario: Producto[]): string[] {
  const todas = inventario.flatMap((p) => [...separarApodos(p.apodos), p.f_tipo, p.f_forma, p.f_marca, p.f_modelo]);
  return [...new Set(todas.filter((x): x is string => !!x && x.length > 1))].slice(0, 100);
}

/**
 * Dictar un pedido. Un toque en el botón de voz y hablas; al terminar, Claude (o el entendedor local si no hay clave
 * o internet) lo convierte en líneas con los nombres reales del inventario. Tú las revisas y recién entonces se agregan.
 */
export default function Pedido() {
  const db = useSQLiteContext();
  const { proyecto, area: areaInicial, auto } = useLocalSearchParams<{ proyecto?: string; area?: string; auto?: string }>();
  const [proyectoId, setProyectoId] = useState<number | null>(proyecto ? Number(proyecto) : null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const aprobada = useEjecucionIniciada(proyectoId);
  const [inventario, setInventario] = useState<Producto[] | null>(null);
  const [conClave, setConClave] = useState(false);
  const [soloLocal, setSoloLocal] = useState(false); // ajuste: entender sin Claude aunque haya clave
  const usaClaude = conClave && !soloLocal;
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState(areaInicial ?? '');
  const [revision, setRevision] = useState<Revision[] | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
  const [clienteNuevo, setClienteNuevo] = useState<string | null>(null); // "para Juan Pérez": se ofrece crear su levantamiento
  const [crearNuevo, setCrearNuevo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [articulo, setArticulo] = useState<{ borrador: BorradorArticulo; datos: DatosProducto; existente: Producto | null } | null>(null);
  const [creado, setCreado] = useState<string | null>(null);

  const arranco = useRef(false);
  const arranque = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      listarCatalogo(db).then(setInventario);
      leerClave().then((c) => setConClave(!!c));
      leerModoEntender().then((m) => setSoloLocal(m === 'local'));
      // levantamientos donde todavía se puede agregar (cotizaciones sin aprobar), el más urgente primero
      proyectosConResumen(db, 'activos', 'cotizacion').then((r) => {
        const libres = r.map((x) => x.proyecto);
        setProyectos(libres);
        setProyectoId((actual) => actual ?? libres[0]?.id ?? null);
      });
    }, [db])
  );

  const porId = new Map((inventario ?? []).map((p) => [p.id, p]));

  function armarRevision(r: ResultadoPedido) {
    if (r.lineas.length === 0) return Alert.alert('No entendí ningún equipo', 'Prueba dictando de nuevo, por ejemplo: "3 cámaras turret y un gabinete 4u pequeño".');
    setNotas(r.notas);
    setClienteNuevo(r.cliente);
    setCrearNuevo(!!r.cliente);
    setRevision(
      r.lineas.map((l, i) => ({
        clave: i,
        texto: l.texto,
        item: l.id !== null ? (porId.get(l.id) ?? null) : null,
        cantidad: l.cantidad,
        area: l.area ?? (area.trim() || 'General'),
        alternativas: l.alternativas.map((id) => porId.get(id)).filter((p): p is Producto => !!p),
        manual: false,
      }))
    );
  }

  /** Entiende lo dictado. Si Claude falla (sin internet, sin saldo...), cae al entendedor local y lo avisa. */
  async function entender(dictado: string, conClaude = usaClaude) {
    const limpio = numerosEnDigitos(dictado);
    if (!limpio.trim()) return Alert.alert('Falta el pedido', 'Toca el micrófono y habla, o escribe lo que necesitas.');
    setCreado(null);
    if (pareceArticuloNuevo(limpio)) return proponerArticulo(limpio, conClaude);
    if (!inventario || inventario.length === 0) return Alert.alert('El inventario está vacío', 'Primero agrega tus equipos y servicios en el menú, Inventario.');
    const articulos = inventario.map(aArticulo);
    setAviso(null);
    setArticulo(null);
    setTrabajando(true);
    try {
      if (!conClaude) return armarRevision(entenderLocal(limpio, articulos));
      try {
        armarRevision(await entenderConClaude(limpio, articulos, area.trim() || null));
      } catch (e) {
        armarRevision(entenderLocal(limpio, articulos));
        setAviso(`${mensajeError(e)} Entendí el pedido con el iPhone, sin Claude; revísalo con más cuidado.`);
      }
    } finally {
      setTrabajando(false);
    }
  }

  /** Foto del sitio: Claude propone qué instalar y tú lo revisas como cualquier pedido. */
  async function entenderFoto(origen: 'camara' | 'galeria') {
    if (!usaClaude) return Alert.alert('Hace falta Claude', 'La foto del sitio la interpreta Claude. Agrega tu clave en Más, Asistente Claude (y deja "Claude primero").');
    if (!inventario || inventario.length === 0) return Alert.alert('El inventario está vacío', 'Primero agrega tus equipos y servicios en el menú, Inventario.');
    const imagen = await tomarImagen(origen);
    if (!imagen) return;
    setAviso(null);
    setArticulo(null);
    setCreado(null);
    setTrabajando(true);
    try {
      armarRevision(await entenderConClaude(numerosEnDigitos(texto), inventario.map(aArticulo), area.trim() || null, imagen));
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  }

  /** "Agrégame una cámara IP de 4mpx bullet al inventario": Claude arma el artículo y tú confirmas antes de guardarlo. */
  async function proponerArticulo(dictado: string, conClaude: boolean) {
    if (!conClaude) return Alert.alert('Hace falta Claude', 'Para crear artículos hablando, agrega tu clave de API en Más, Asistente Claude.');
    setAviso(null);
    setArticulo(null);
    setRevision(null);
    setTrabajando(true);
    try {
      const borrador = await entenderArticuloConClaude(dictado);
      const datos = aDatosProducto(borrador);
      const existente = (inventario ?? []).find((p) => normalizar(p.nombre) === normalizar(datos.nombre)) ?? null;
      setArticulo({ borrador, datos, existente });
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function crearArticulo() {
    if (!articulo) return;
    await crearProducto(db, articulo.datos);
    setCreado(articulo.datos.nombre);
    setArticulo(null);
    setTexto('');
    setInventario(await listarCatalogo(db));
  }

  // ---------- voz ----------

  const { escuchando, aviso: avisoVoz, iniciar, detener } = useVoz(setTexto, (dictado) => intentar(() => entender(dictado)));

  // al entrar con el botón redondo, empieza a escuchar cuando la pantalla ya terminó de abrirse y el inventario está listo
  useEffect(() => {
    if (auto !== '1' || inventario === null || arranco.current) return;
    arranco.current = true;
    arranque.current = setTimeout(() => iniciar('', palabrasClave(inventario)), 450); // espera a que termine la animación de la pantalla
  }, [auto, inventario, iniciar]);
  useEffect(
    () => () => {
      if (arranque.current) clearTimeout(arranque.current);
    },
    []
  );

  // ---------- revisión ----------

  const cambiar = (clave: number, cambio: Partial<Revision>) => setRevision((rs) => rs && rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  const quitar = (clave: number) => setRevision((rs) => rs && rs.filter((r) => r.clave !== clave));

  /** Cambia el artículo propuesto por una de las alternativas; el anterior pasa a ser alternativa. */
  function elegirAlternativa(r: Revision, nuevo: Producto) {
    cambiar(r.clave, { item: nuevo, manual: false, alternativas: [...(r.item ? [r.item] : []), ...r.alternativas.filter((a) => a.id !== nuevo.id)].slice(0, 3) });
  }

  const listas = (revision ?? []).filter((r) => r.item || r.manual);
  const sinResolver = (revision ?? []).length - listas.length;

  /** El tipo de proyecto sale de la categoría que más se repite en las líneas (CCTV, Alarma...); si no cuadra, "Otro". */
  function tipoDeLasLineas(): string {
    const cuenta = new Map<string, number>();
    for (const r of listas) if (r.item?.categoria) cuenta.set(r.item.categoria, (cuenta.get(r.item.categoria) ?? 0) + r.cantidad);
    const mejor = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0];
    return (TIPOS as readonly string[]).includes(mejor ?? '') ? (mejor as string) : 'Otro';
  }

  async function agregar() {
    const nuevo = crearNuevo && clienteNuevo;
    if (proyectoId === null && !nuevo) return Alert.alert('Elige el levantamiento', 'Toca el levantamiento al que quieres agregar estos equipos.');
    if (listas.length === 0) return Alert.alert('Nada que agregar', 'Elige un artículo para cada línea, o márcala "Agregar a mano".');
    let destino = proyectoId as number;
    if (nuevo) {
      const tipo = tipoDeLasLineas();
      destino = await crearProyecto(db, await buscarOCrearCliente(db, clienteNuevo), nombreAutomatico(tipo, clienteNuevo), tipo);
    }
    const op = await obtenerOpciones(db, destino);
    for (const r of listas) {
      const datos = { area: r.area.trim() || 'General', equipo: r.item ? r.item.nombre : capitalizar(r.texto), cantidad: r.cantidad, notas: null, foto_uri: null };
      if (r.item) await crearPartida(db, destino, datos, r.item, precioParaProyecto(r.item, op.nivel, op.con_itbis, op.impuesto_pct));
      else await crearPartida(db, destino, datos);
    }
    if (nuevo) router.replace({ pathname: '/proyecto/[id]', params: { id: destino } });
    else router.back();
  }

  if (aprobada && proyectoId !== null) return <AvisoEjecucion proyectoId={proyectoId} />;

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Dictar pedido' }} />

      <Tarjeta>
        <Etiqueta>Levantamiento</Etiqueta>
        {proyectos.length === 0 ? (
          <Link href="/proyecto/nuevo" style={estilos.enlace}>
            No hay levantamientos. Crea uno con el cliente.
          </Link>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila} keyboardShouldPersistTaps="handled">
            {proyectos.map((p) => (
              <Chip key={p.id} borde texto={p.nombre.length > 26 ? `${p.nombre.slice(0, 25)}…` : p.nombre} activo={proyectoId === p.id} onPress={() => setProyectoId(p.id)} />
            ))}
            <Chip borde texto="+ Nuevo" onPress={() => router.push('/proyecto/nuevo')} />
          </ScrollView>
        )}
      </Tarjeta>

      <Tarjeta style={{ alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={escuchando ? 'Dejar de escuchar' : 'Empezar a dictar'}
          style={[estilos.mic, escuchando && estilos.micActivo]}
          onPress={() => (escuchando ? detener() : iniciar(texto, palabrasClave(inventario ?? [])))}>
          <IconoMic escala={1.5} />
        </Pressable>
        <Text style={estilos.estadoMic}>{escuchando ? 'Te escucho… se detiene solo cuando dejes de hablar' : trabajando ? 'Entendiendo tu pedido…' : 'Toca y habla'}</Text>
        {trabajando ? <ActivityIndicator color={color.primario} /> : null}
        {avisoVoz ?? aviso ? <Text style={estilos.aviso}>{avisoVoz ?? aviso}</Text> : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Lo que dictaste (puedes corregirlo)</Etiqueta>
        <Campo
          placeholder='Ej: "en la entrada 3 cámaras turret, un gabinete 4u pequeño y 3 puntos de instalación"'
          value={texto}
          onChangeText={setTexto}
          onEndEditing={() => setTexto((t) => numerosEnDigitos(t))}
          multilinea
          style={{ minHeight: 90 }}
        />
        <Etiqueta>Área (si no la mencionas al dictar)</Etiqueta>
        <Campo placeholder="Ej. Entrada, Bodega" value={area} onChangeText={setArea} />
        {conClave ? (
          <>
            <Text style={estilos.detalle}>También puedes decir: «agrégame una cámara IP de 4 megapíxeles bullet al inventario».</Text>
            <Boton texto="Entender con Claude" onPress={() => entender(texto, true)} />
            <Boton tipo="secundario" texto="Entender sin Claude (gratis, sin internet)" onPress={() => entender(texto, false)} />
            <View style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Boton tipo="secundario" icono="camera" texto="Foto del sitio" onPress={() => entenderFoto('camara')} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton tipo="secundario" icono="photo" texto="De la galería" onPress={() => entenderFoto('galeria')} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Boton texto="Entender pedido" onPress={() => entender(texto, false)} />
            <Link href="/asistente" style={estilos.enlace}>
              Con Claude se entienden frases más complejas. Agrega tu clave de API.
            </Link>
          </>
        )}
      </Tarjeta>

      {creado ? (
        <Tarjeta style={{ gap: 4 }}>
          <Text style={[estilos.nombre, { color: color.ok }]}>✓ Se agregó al inventario</Text>
          <Text style={estilos.detalle}>{creado}</Text>
        </Tarjeta>
      ) : null}

      {articulo ? (
        <Tarjeta style={{ gap: 6 }}>
          <Etiqueta>Nuevo artículo en el inventario</Etiqueta>
          <Text style={estilos.nombre}>{articulo.datos.nombre}</Text>
          <Text style={estilos.detalle}>
            {articulo.datos.categoria} · {articulo.datos.tipo === 'servicio' ? 'servicio' : 'equipo'}
          </Text>
          {CASILLAS.map((c) => (
            <Text key={c} style={estilos.detalle}>
              {FAMILIAS[articulo.borrador.familia].etiquetas[c]}: {articulo.borrador.partes[c].toUpperCase() === NA ? 'No aplica' : articulo.borrador.partes[c]}
            </Text>
          ))}
          <Text style={estilos.detalle}>
            {articulo.borrador.costo_cts > 0
              ? `Costo ${moneda(articulo.borrador.costo_cts)} · los precios salen de tus márgenes`
              : 'Sin costo ni precio todavía: complétalo después en el inventario.'}
          </Text>
          {articulo.borrador.notas ? <Text style={estilos.nota}>{articulo.borrador.notas}</Text> : null}
          {articulo.existente ? (
            <Text style={estilos.aviso}>
              Ya existe «{articulo.existente.nombre}»{articulo.existente.codigo ? ` (${articulo.existente.codigo})` : ''}. Revisa antes de crear otro igual.
            </Text>
          ) : null}
          <Boton texto={articulo.existente ? 'Crear de todos modos' : 'Crear en el inventario'} onPress={crearArticulo} />
          <Boton tipo="secundario" texto="Descartar" onPress={() => setArticulo(null)} />
        </Tarjeta>
      ) : null}

      {revision ? (
        <>
          <Etiqueta>Revisa antes de agregar</Etiqueta>
          {notas ? <Text style={estilos.nota}>{notas}</Text> : null}
          {clienteNuevo ? (
            <Tarjeta style={{ gap: 6 }}>
              <Text style={estilos.nombre}>Para «{clienteNuevo}»</Text>
              <View style={estilos.fila}>
                <Chip borde activo={crearNuevo} texto="Crear su levantamiento" onPress={() => setCrearNuevo(true)} />
                <Chip borde activo={!crearNuevo} texto="Usar el elegido arriba" onPress={() => setCrearNuevo(false)} />
              </View>
              {crearNuevo ? <Text style={estilos.detalle}>Si el cliente no existe se crea; el levantamiento se abre al terminar.</Text> : null}
            </Tarjeta>
          ) : null}
          {revision.map((r) => (
            <Tarjeta key={r.clave} style={{ gap: 6 }}>
              {r.item ? (
                <>
                  <Text style={estilos.nombre}>{r.item.nombre}</Text>
                  <Text style={estilos.detalle}>
                    {r.item.codigo ? `${r.item.codigo} · ` : ''}
                    {r.item.stock !== null ? `stock ${r.item.stock}` : r.item.categoria ?? ''}
                  </Text>
                </>
              ) : (
                <Text style={[estilos.nombre, !r.manual && { color: color.alerta }]}>
                  {r.manual ? `${capitalizar(r.texto)} (a mano, sin precio)` : `No encontré: «${r.texto}»`}
                </Text>
              )}
              <Text style={estilos.detalle}>
                Dictado: «{r.texto}» · Área: {r.area}
              </Text>

              <View style={estilos.fila}>
                <Pressable accessibilityRole="button" accessibilityLabel="Quitar una unidad" style={estilos.paso} onPress={() => cambiar(r.clave, { cantidad: Math.max(1, r.cantidad - 1) })}>
                  <Text style={estilos.pasoTexto}>−</Text>
                </Pressable>
                <Text style={estilos.cantidad}>{r.cantidad}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Agregar una unidad" style={estilos.paso} onPress={() => cambiar(r.clave, { cantidad: r.cantidad + 1 })}>
                  <Text style={estilos.pasoTexto}>+</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Chip borde texto="Quitar" onPress={() => quitar(r.clave)} />
              </View>

              {r.item && r.item.stock !== null && r.cantidad > r.item.stock ? <Text style={estilos.aviso}>Solo hay {r.item.stock} en bodega.</Text> : null}

              {r.alternativas.length > 0 ? (
                <>
                  <Text style={estilos.detalle}>{r.item ? '¿Era otro?' : '¿Será alguno de estos?'}</Text>
                  <View style={estilos.fila}>
                    {r.alternativas.map((a) => (
                      <Chip key={a.id} borde texto={a.nombre.length > 34 ? `${a.nombre.slice(0, 33)}…` : a.nombre} onPress={() => elegirAlternativa(r, a)} />
                    ))}
                  </View>
                </>
              ) : null}
              {!r.item ? <Chip borde activo={r.manual} texto={r.manual ? 'Se agrega a mano' : 'Agregar a mano'} onPress={() => cambiar(r.clave, { manual: !r.manual })} /> : null}
            </Tarjeta>
          ))}
          {sinResolver > 0 ? <Text style={estilos.aviso}>{sinResolver} línea(s) sin artículo no se agregarán.</Text> : null}
          <Boton texto={crearNuevo && clienteNuevo ? `Crear levantamiento con ${listas.length} línea${listas.length === 1 ? '' : 's'}` : `Agregar ${listas.length} línea${listas.length === 1 ? '' : 's'} al levantamiento`} onPress={agregar} />
        </>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  enlace: { color: color.primario, fontSize: 14 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 13, color: color.suave },
  nota: { fontSize: 14, color: color.alerta },
  aviso: { fontSize: 13, color: color.alerta, fontWeight: '600', textAlign: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paso: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, color: color.texto },
  cantidad: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '700', color: color.texto },
  mic: { width: 96, height: 96, borderRadius: 48, backgroundColor: color.primario, alignItems: 'center', justifyContent: 'center' },
  micActivo: { backgroundColor: color.peligro },
  estadoMic: { fontSize: 15, fontWeight: '600', color: color.texto },
});
