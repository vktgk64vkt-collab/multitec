import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarCatalogo, type Producto, type TipoItem } from '@/db/catalogo';
import { listarTrabajos, obtenerOpciones } from '@/db/cotizacion';
import {
  agregarAEjecucion,
  agregarComprobante,
  cambiarCantidad,
  descartarEjecucion,
  ejecucionIniciada,
  eliminarComprobante,
  iniciarEjecucion,
  listarComprobantes,
  listarEjecucion,
  quitarLinea,
  restaurarLinea,
  resumenEjecucion,
  type Comprobante,
  type LineaEjecucion,
  type ResumenEjecucion,
} from '@/db/ejecucion';
import { FilaDeslizable } from '@/deslizar';
import { aCentavos, formatear, formatearFecha, importe, moneda, precioParaProyecto } from '@/dinero';
import { textoCambio, tipoCambio } from '@/ejecucion';
import { borrarFotos, guardarFoto, uriFoto } from '@/fotos';
import { detalleArticulo } from '@/nomenclatura';
import { agruparPorTrabajo, etiquetaTrabajo, hayVariosTrabajos, limpiarTrabajo, trabajoAuto } from '@/trabajos';
import { SelectorTrabajo } from '@/trabajosUi';
import { color } from '@/tema';
import { Buscador, Boton, Campo, Chip, Etiqueta, PROPS_TECLADO, Tarjeta } from '@/ui';

const MAX_SUGERENCIAS = 6;

/**
 * Ejecución del proyecto: entre la cotización y la factura. Aquí se arreglan los cambios del trabajo real (equipos que se
 * agregan, se quitan o cambian de cantidad) y se suben los comprobantes de materiales. Lo que quede aquí es lo que se factura.
 */
export default function Ejecucion() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [iniciada, setIniciada] = useState<boolean | null>(null);
  const [lineas, setLineas] = useState<LineaEjecucion[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [resumen, setResumen] = useState<ResumenEjecucion | null>(null);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [trabajos, setTrabajos] = useState<string[]>([]);
  const [trabajo, setTrabajo] = useState<string | undefined>(undefined); // undefined = Auto
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');
  const [tipo, setTipo] = useState<TipoItem>('equipo');
  const [borrador, setBorrador] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [monto, setMonto] = useState('');
  const [visor, setVisor] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // sin ejecución iniciada, listarEjecucion devuelve [] y resumenEjecucion null: no hace falta esperar a saberlo
    Promise.all([
      ejecucionIniciada(db, proyectoId),
      listarEjecucion(db, proyectoId),
      resumenEjecucion(db, proyectoId),
      listarComprobantes(db, proyectoId),
      listarTrabajos(db, proyectoId),
      listarCatalogo(db),
    ]).then(([ini, ls, res, comps, ts, inv]) => {
      setIniciada(ini);
      setLineas(ls);
      setResumen(res);
      setComprobantes(comps);
      setTrabajos(ts);
      setInventario(inv);
    });
  }, [db, proyectoId]);
  useFocusEffect(cargar);

  const texto = busqueda.trim().toLowerCase();
  const sugerencias = texto
    ? inventario
        .filter((p) => p.nombre.toLowerCase().includes(texto) || (p.codigo ?? '').toLowerCase().includes(texto) || (p.categoria ?? '').toLowerCase().includes(texto))
        .slice(0, MAX_SUGERENCIAS)
    : [];

  async function iniciar() {
    if (!(await iniciarEjecucion(db, proyectoId))) {
      return Alert.alert('Primero la cotización', 'La ejecución parte de la cotización. Arma la cotización con al menos una línea y vuelve aquí.');
    }
    cargar();
  }

  async function agregarDelInventario(p: Producto) {
    const op = await obtenerOpciones(db, proyectoId);
    await agregarAEjecucion(db, proyectoId, {
      descripcion: p.nombre,
      cantidad: 1,
      precio_cts: precioParaProyecto(p, op.nivel, op.con_itbis, op.impuesto_pct),
      tipo: p.tipo,
      costo_cts: p.costo_cts,
      item_id: p.id,
      detalle: detalleArticulo(p),
      trabajo: trabajo === undefined ? trabajoAuto(p.categoria) : limpiarTrabajo(trabajo),
    });
    setBusqueda('');
    cargar();
  }

  async function agregarManual() {
    const n = Number(cantidad);
    const cts = aCentavos(precio);
    if (!descripcion.trim() || !Number.isInteger(n) || n < 1 || cts === null) {
      return Alert.alert('Faltan datos', 'Escribe qué es, la cantidad (entera, mayor a 0) y el precio con el que se factura.');
    }
    await agregarAEjecucion(db, proyectoId, { descripcion: descripcion.trim(), cantidad: n, precio_cts: cts, tipo, trabajo: limpiarTrabajo(trabajo) });
    setDescripcion('');
    setCantidad('1');
    setPrecio('');
    cargar();
  }

  async function ponerCantidad(l: LineaEjecucion, nueva: number) {
    await cambiarCantidad(db, l.id, nueva);
    cargar();
  }

  async function quitar(l: LineaEjecucion) {
    await quitarLinea(db, l.id);
    cargar();
  }

  async function restaurar(l: LineaEjecucion) {
    await restaurarLinea(db, l.id);
    cargar();
  }

  // ---------- comprobantes ----------

  async function elegirFoto(camara: boolean) {
    if (camara) {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) return Alert.alert('Sin permiso', 'Activa la cámara en Ajustes para tomar la foto, o elige la captura desde Fotos.');
    }
    const r = camara
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) setBorrador(r.assets[0].uri);
  }

  async function guardarComprobante() {
    if (!borrador) return;
    const cts = monto.trim() === '' ? null : aCentavos(monto);
    if (monto.trim() !== '' && cts === null) return Alert.alert('Monto inválido', 'Escribe el monto del comprobante como número, por ejemplo 2500.50, o déjalo vacío.');
    await agregarComprobante(db, proyectoId, guardarFoto(borrador), nota.trim() || null, cts);
    setBorrador(null);
    setNota('');
    setMonto('');
    cargar();
  }

  function confirmarEliminarComprobante(c: Comprobante) {
    Alert.alert('Eliminar comprobante', '¿Eliminar esta captura? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarComprobante(db, c.id);
          borrarFotos([c.foto_uri]);
          cargar();
        },
      },
    ]);
  }

  // ---------- cierre de la ejecución ----------

  function pasarAFacturacion() {
    if (!resumen) return;
    const partes = [
      resumen.cambios > 0 ? `${resumen.cambios} cambio${resumen.cambios === 1 ? '' : 's'} sobre la cotización.` : 'Sin cambios sobre la cotización.',
      `Se facturará ${moneda(resumen.real_cts)} (cotizado ${moneda(resumen.cotizado_cts)}).`,
      resumen.comprobantes === 0 ? 'Todavía no subiste comprobantes.' : '',
    ].filter(Boolean);
    Alert.alert('Pasar a facturación', partes.join('\n'), [
      { text: 'Seguir revisando', style: 'cancel' },
      { text: 'Continuar', onPress: () => router.push({ pathname: '/factura', params: { proyecto: proyectoId } }) },
    ]);
  }

  function confirmarDescartar() {
    Alert.alert('Descartar la ejecución', 'Se borran los cambios hechos aquí y el proyecto vuelve a la cotización original. Los comprobantes se conservan.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await descartarEjecucion(db, proyectoId);
          cargar();
        },
      },
    ]);
  }

  const diferencia = resumen ? resumen.real_cts - resumen.cotizado_cts : 0;
  // con varios trabajos, las líneas se ordenan por trabajo y cada una lo muestra
  const variosTrabajos = hayVariosTrabajos(lineas);
  const ordenadas = variosTrabajos ? agruparPorTrabajo(lineas).flatMap((g) => g.lineas) : lineas;

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Ejecución' }} />

      {iniciada === null ? null : !iniciada ? (
        <Tarjeta>
          <Etiqueta>Aún no empieza la ejecución</Etiqueta>
          <Text style={estilos.texto}>
            Aquí registras lo que cambia mientras trabajas: equipos que agregas o quitas, y las capturas de las facturas de materiales. Al iniciar se copia la
            cotización como punto de partida; lo que ajustes aquí es lo que se factura.
          </Text>
          <Boton texto="Iniciar ejecución" onPress={iniciar} />
        </Tarjeta>
      ) : (
        <>
          {resumen ? (
            <Tarjeta>
              <Etiqueta>Revisión antes de facturar</Etiqueta>
              <View style={estilos.fila}>
                <Text style={estilos.detalle}>Cotizado</Text>
                <Text style={estilos.valor}>{moneda(resumen.cotizado_cts)}</Text>
              </View>
              <View style={estilos.fila}>
                <Text style={estilos.detalle}>Real (lo que se factura)</Text>
                <Text style={estilos.total}>{moneda(resumen.real_cts)}</Text>
              </View>
              <View style={estilos.fila}>
                <Text style={estilos.detalle}>Diferencia</Text>
                <Text style={[estilos.valor, { color: diferencia === 0 ? color.suave : diferencia > 0 ? color.ok : color.alerta }]}>
                  {diferencia > 0 ? '+' : ''}
                  {moneda(diferencia)}
                </Text>
              </View>
              <Text style={estilos.detalle}>
                {resumen.cambios === 0 ? 'Sin cambios sobre la cotización.' : `${resumen.cambios} cambio${resumen.cambios === 1 ? '' : 's'} sobre la cotización.`}
              </Text>
              <Text style={estilos.detalle}>
                Materiales comprados: {moneda(resumen.gastos_cts)} · {resumen.comprobantes} comprobante{resumen.comprobantes === 1 ? '' : 's'}
              </Text>
            </Tarjeta>
          ) : null}

          <Etiqueta>Equipos y materiales</Etiqueta>
          {lineas.length === 0 ? <Text style={estilos.vacio}>No hay equipos en la ejecución.</Text> : null}
          {ordenadas.map((l) => {
            const cambio = tipoCambio(l);
            const quitada = l.cantidad === 0 && l.cantidad_cotizada > 0;
            return (
              <FilaDeslizable key={l.id} etiqueta="Quitar" onAccion={() => quitar(l)}>
                <Tarjeta style={{ gap: 6, opacity: quitada ? 0.55 : 1 }}>
                  <View style={estilos.fila}>
                    <View style={{ flex: 1, gap: 2 }}>
                      {variosTrabajos ? <Text style={estilos.detalle}>{etiquetaTrabajo(l.trabajo)}</Text> : null}
                      <Text style={[estilos.nombre, quitada && estilos.tachado]}>{l.descripcion}</Text>
                      {cambio !== 'igual' ? <Text style={[estilos.cambio, cambio === 'agregado' ? { color: color.ok } : cambio === 'quitado' ? { color: color.peligro } : null]}>{textoCambio(l)}</Text> : null}
                      {l.detalle ? <Text style={estilos.detalle}>{l.detalle}</Text> : null}
                    </View>
                    <View style={estilos.cantidades}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Quitar una unidad" style={estilos.paso} onPress={() => ponerCantidad(l, l.cantidad - 1)}>
                        <Text style={estilos.pasoTexto}>−</Text>
                      </Pressable>
                      <Text style={estilos.cantidad}>{l.cantidad}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Agregar una unidad" style={estilos.paso} onPress={() => ponerCantidad(l, l.cantidad + 1)}>
                        <Text style={estilos.pasoTexto}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={estilos.fila}>
                    <Text style={estilos.detalle}>{formatear(l.precio_cts)} c/u</Text>
                    <Text style={estilos.valor}>{moneda(importe(l))}</Text>
                  </View>
                  {quitada ? <Chip borde texto="Restaurar" onPress={() => restaurar(l)} /> : null}
                </Tarjeta>
              </FilaDeslizable>
            );
          })}
          {lineas.length > 0 ? <Text style={estilos.pista}>Desliza una línea hacia la izquierda para quitarla.</Text> : null}

          <Tarjeta>
            <Etiqueta>Agregar algo que se usó</Etiqueta>
            <SelectorTrabajo trabajos={trabajos} valor={trabajo} onElegir={setTrabajo} />
            <Buscador placeholder="Buscar en el inventario (nombre o código)" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />
            {sugerencias.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Agregar ${p.nombre}`} style={estilos.sugerencia} onPress={() => agregarDelInventario(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nombre}>{p.nombre}</Text>
                  <Text style={estilos.detalle}>
                    {p.codigo ? `${p.codigo} · ` : ''}
                    {p.stock !== null ? `stock ${p.stock}` : (p.categoria ?? '')}
                  </Text>
                </View>
                <Text style={estilos.valor}>+ Agregar</Text>
              </Pressable>
            ))}
            {texto && sugerencias.length === 0 ? <Text style={estilos.detalle}>Sin resultados.</Text> : null}

            <Etiqueta>O algo que no está en el inventario (material suelto, compras)</Etiqueta>
            <View style={estilos.chips}>
              <Chip texto="Equipo" activo={tipo === 'equipo'} onPress={() => setTipo('equipo')} />
              <Chip texto="Servicio" activo={tipo === 'servicio'} onPress={() => setTipo('servicio')} />
            </View>
            <Campo placeholder="Descripción (ej. Canaleta 20x10, 10 m)" value={descripcion} onChangeText={setDescripcion} />
            <View style={estilos.fila}>
              <Campo style={{ flex: 1 }} placeholder="Cantidad" keyboardType="number-pad" value={cantidad} onChangeText={setCantidad} />
              <Campo style={{ flex: 1 }} placeholder="Precio" keyboardType="decimal-pad" value={precio} onChangeText={setPrecio} />
            </View>
            <Boton tipo="secundario" texto="Agregar a la ejecución" onPress={agregarManual} />
          </Tarjeta>

          <Etiqueta>Comprobantes y capturas</Etiqueta>
          <Tarjeta>
            <Text style={estilos.detalle}>Sube la captura de la factura de un material, o la foto de algo que se agregó o se quitó.</Text>
            <View style={estilos.chips}>
              <Chip borde texto="Elegir de Fotos" onPress={() => elegirFoto(false)} />
              <Chip borde texto="Tomar foto" onPress={() => elegirFoto(true)} />
            </View>
            {borrador ? (
              <>
                <Image source={{ uri: borrador }} style={estilos.vistaBorrador} resizeMode="contain" />
                <Campo placeholder="Nota (ej. Ferretería Díaz, cable UTP)" value={nota} onChangeText={setNota} />
                <Campo placeholder="Monto de la compra (opcional)" keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
                <Boton texto="Guardar comprobante" onPress={guardarComprobante} />
                <Boton
                  tipo="secundario"
                  texto="Cancelar"
                  onPress={() => {
                    setBorrador(null);
                    setNota('');
                    setMonto('');
                  }}
                />
              </>
            ) : null}
          </Tarjeta>
          {comprobantes.length === 0 ? <Text style={estilos.vacio}>Aún no hay comprobantes.</Text> : null}
          {comprobantes.map((c) => (
            <FilaDeslizable key={c.id} onAccion={() => confirmarEliminarComprobante(c)}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Ver comprobante ${c.nota ?? ''}`} onPress={() => setVisor(uriFoto(c.foto_uri))}>
                <Tarjeta style={estilos.comprobante}>
                  <Image source={{ uri: uriFoto(c.foto_uri) }} style={estilos.miniatura} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={estilos.nombre}>{c.nota ?? 'Sin nota'}</Text>
                    <Text style={estilos.detalle}>{formatearFecha(c.creado_en, true)}</Text>
                  </View>
                  {c.monto_cts !== null ? <Text style={estilos.valor}>{moneda(c.monto_cts)}</Text> : null}
                </Tarjeta>
              </Pressable>
            </FilaDeslizable>
          ))}
          {comprobantes.length > 0 ? <Text style={estilos.pista}>Toca una captura para verla grande. Desliza para eliminarla.</Text> : null}

          <Boton texto="Pasar a facturación" onPress={pasarAFacturacion} />
          <Boton tipo="peligro" texto="Descartar la ejecución" onPress={confirmarDescartar} />
        </>
      )}

      <Modal visible={!!visor} transparent animationType="fade" onRequestClose={() => setVisor(null)}>
        <Pressable accessibilityLabel="Cerrar" style={estilos.visor} onPress={() => setVisor(null)}>
          {visor ? <Image source={{ uri: visor }} style={estilos.imagenGrande} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 14, color: color.suave },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  tachado: { textDecorationLine: 'line-through' },
  detalle: { fontSize: 13, color: color.suave },
  cambio: { fontSize: 13, fontWeight: '700', color: color.alerta },
  valor: { fontSize: 15, fontWeight: '700', color: color.texto },
  total: { fontSize: 20, fontWeight: '800', color: color.texto },
  vacio: { textAlign: 'center', color: color.suave },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
  cantidades: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paso: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, color: color.texto },
  cantidad: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '700', color: color.texto },
  sugerencia: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borde },
  vistaBorrador: { width: '100%', height: 220, borderRadius: 12, backgroundColor: color.fondo },
  comprobante: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniatura: { width: 64, height: 64, borderRadius: 10, backgroundColor: color.fondo },
  visor: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  imagenGrande: { width: '100%', height: '90%' },
});
