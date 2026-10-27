import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarCatalogo, type Producto, type TipoItem } from '@/db/catalogo';
import {
  actualizarDescuento,
  actualizarPrecio,
  aplicarPrecios,
  contarPartidasPendientes,
  crearLinea,
  eliminarLinea,
  guardarImpuesto,
  importarDelLevantamiento,
  listarLineas,
  obtenerOpciones,
  type Linea,
} from '@/db/cotizacion';
import { guardarCondiciones, obtenerCondiciones, obtenerProyecto } from '@/db/proyectos';
import { aCentavos, formatear, importe, ITBIS_PCT, precioParaProyecto, totales } from '@/dinero';
import { compartirPdf, negocioParaPdf } from '@/pdf';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

const SECCIONES: { tipo: TipoItem; titulo: string }[] = [
  { tipo: 'equipo', titulo: 'Equipos' },
  { tipo: 'servicio', titulo: 'Mano de obra y servicios' },
];

export default function Cotizacion() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [descuentos, setDescuentos] = useState<Record<number, string>>({});
  const [impuesto, setImpuesto] = useState('0');
  const [condiciones, setCondiciones] = useState('');
  const [nivel, setNivel] = useState(1);
  const [conItbis, setConItbis] = useState(false);
  const [tipo, setTipo] = useState<TipoItem>('equipo');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');

  const cargar = useCallback(
    () =>
      listarLineas(db, proyectoId).then(async (ls) => {
        setLineas(ls);
        setPrecios(Object.fromEntries(ls.map((l) => [l.id, l.precio_cts ? String(l.precio_cts / 100) : ''])));
        setDescuentos(Object.fromEntries(ls.map((l) => [l.id, l.descuento_pct ? String(l.descuento_pct) : ''])));
        setPendientes(await contarPartidasPendientes(db, proyectoId));
      }),
    [db, proyectoId]
  );

  useEffect(() => {
    cargar();
    listarCatalogo(db).then(setInventario);
    obtenerOpciones(db, proyectoId).then((o) => {
      setImpuesto(String(o.impuesto_pct));
      setNivel(o.nivel);
      setConItbis(o.con_itbis);
    });
    obtenerCondiciones(db, proyectoId).then(setCondiciones);
  }, [cargar, db, proyectoId]);

  const pct = Number(impuesto) >= 0 && Number.isFinite(Number(impuesto)) ? Number(impuesto) : 0;
  const t = totales(lineas, pct, conItbis);
  // la ganancia se mide sin ITBIS: el costo no lo lleva y el impuesto no es tuyo
  const ganancia = lineas.reduce((s, l) => s + (conItbis ? importe(l) / (1 + pct / 100) : importe(l)) - l.cantidad * l.costo_cts, 0);
  const hayCostos = lineas.some((l) => l.costo_cts > 0);

  async function guardarPrecio(l: Linea) {
    const cts = aCentavos(precios[l.id] ?? '');
    if (cts === null) return cargar();
    await actualizarPrecio(db, l.id, cts);
    setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, precio_cts: cts } : x)));
  }

  async function guardarDescuento(l: Linea) {
    const texto = (descuentos[l.id] ?? '').trim();
    const d = texto === '' ? 0 : Number(texto.replace(',', '.'));
    if (!Number.isFinite(d) || d < 0 || d > 100) {
      Alert.alert('Descuento inválido', 'Escribe un porcentaje entre 0 y 100.');
      return cargar();
    }
    await actualizarDescuento(db, l.id, d);
    setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, descuento_pct: d } : x)));
  }

  async function agregar() {
    const n = Number(cantidad);
    const cts = aCentavos(precio);
    if (!descripcion.trim() || !Number.isInteger(n) || n < 1 || cts === null) {
      return Alert.alert('Faltan datos', 'Escribe la descripción, una cantidad entera mayor a 0 y el precio.');
    }
    await crearLinea(db, proyectoId, { descripcion: descripcion.trim(), cantidad: n, precio_cts: cts, tipo });
    setDescripcion('');
    setCantidad('1');
    setPrecio('');
    cargar();
  }

  async function agregarDelInventario(p: Producto) {
    await crearLinea(db, proyectoId, {
      descripcion: p.nombre,
      cantidad: 1,
      precio_cts: precioParaProyecto(p, nivel, conItbis),
      tipo: p.tipo,
      costo_cts: p.costo_cts,
      item_id: p.id,
    });
    cargar();
  }

  async function pdf() {
    const p = await obtenerProyecto(db, proyectoId);
    if (!p || lineas.length === 0) return Alert.alert('Nada que compartir', 'Agrega líneas a la cotización primero.');
    const ok = await compartirPdf({
      titulo: `Cotización #${p.id}`,
      fecha: new Date().toLocaleDateString('en-CA'),
      cliente: p.cliente,
      proyecto: p.nombre,
      negocio: await negocioParaPdf(db),
      lineas,
      condiciones,
      preciosConItbis: conItbis,
      ...t,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
  }

  async function cambiarPrecios(nuevoNivel: number, nuevoItbis: boolean) {
    const aplicar = async () => {
      await aplicarPrecios(db, proyectoId, nuevoNivel, nuevoItbis);
      setNivel(nuevoNivel);
      setConItbis(nuevoItbis);
      cargar();
    };
    if (!lineas.some((l) => l.item_id !== null)) return aplicar();
    Alert.alert('Cambiar precios', 'Las líneas que vienen del inventario se recalculan. Las que escribiste a mano no cambian.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar', onPress: aplicar },
    ]);
  }

  function confirmarEliminar(l: Linea) {
    Alert.alert('Eliminar línea', `¿Eliminar ${l.descripcion}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarLinea(db, l.id);
          cargar();
        },
      },
    ]);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Cotización' }} />

      {pendientes > 0 && (
        <Boton
          texto={`Importar ${pendientes} partida${pendientes === 1 ? '' : 's'} del levantamiento`}
          onPress={async () => {
            await importarDelLevantamiento(db, proyectoId);
            cargar();
          }}
        />
      )}

      {lineas.length === 0 && pendientes === 0 && (
        <Text style={estilos.vacio}>
          La cotización está vacía. Elige equipos en el levantamiento, del inventario aquí abajo, o agrega una línea a mano.
        </Text>
      )}

      {SECCIONES.map(({ tipo: tipoSeccion, titulo }) => {
        const delTipo = lineas.filter((l) => l.tipo === tipoSeccion);
        if (delTipo.length === 0) return null;
        return (
          <View key={tipoSeccion} style={{ gap: 10 }}>
            <View style={estilos.dos}>
              <Etiqueta>{titulo}</Etiqueta>
              <Text style={estilos.detalle}>{formatear(delTipo.reduce((s, l) => s + importe(l), 0))}</Text>
            </View>
            {delTipo.map((l) => (
              <Pressable key={l.id} onLongPress={() => confirmarEliminar(l)}>
                <Tarjeta>
                  <View style={estilos.dos}>
                    <Text style={estilos.nombre}>{l.descripcion}</Text>
                    <Text style={estilos.importe}>{formatear(importe(l))}</Text>
                  </View>
                  <Text style={estilos.detalle}>
                    {l.cantidad} × {formatear(l.precio_cts)}
                    {l.descuento_pct ? ` − ${l.descuento_pct}%` : ''}
                    {l.precio_cts === 0 ? ' · falta el precio' : ''}
                  </Text>
                  <View style={estilos.dos}>
                    <Campo
                      style={estilos.mitad}
                      placeholder="Precio"
                      keyboardType="decimal-pad"
                      value={precios[l.id] ?? ''}
                      onChangeText={(v) => setPrecios((p) => ({ ...p, [l.id]: v }))}
                      onEndEditing={() => guardarPrecio(l)}
                    />
                    <Campo
                      style={estilos.mitad}
                      placeholder="Desc. %"
                      keyboardType="decimal-pad"
                      value={descuentos[l.id] ?? ''}
                      onChangeText={(v) => setDescuentos((p) => ({ ...p, [l.id]: v }))}
                      onEndEditing={() => guardarDescuento(l)}
                    />
                  </View>
                </Tarjeta>
              </Pressable>
            ))}
          </View>
        );
      })}
      {lineas.length > 0 && <Text style={estilos.pista}>Mantén presionada una línea para eliminarla.</Text>}

      {inventario.length > 0 && (
        <>
          <Etiqueta>Del inventario</Etiqueta>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips} keyboardShouldPersistTaps="handled">
            {inventario.map((p) => (
              <Pressable key={p.id} style={estilos.chip} onPress={() => agregarDelInventario(p)}>
                <Text style={estilos.textoChip}>
                  {p.nombre} · {formatear(precioParaProyecto(p, nivel, conItbis))}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <Tarjeta>
        <Etiqueta>Precios del inventario</Etiqueta>
        <View style={estilos.chips}>
          {[1, 2, 3].map((n) => (
            <Pressable key={n} style={[estilos.opcion, nivel === n && estilos.activa]} onPress={() => cambiarPrecios(n, conItbis)}>
              <Text style={[estilos.textoOpcion, nivel === n && estilos.textoActivo]}>Precio {n}</Text>
            </Pressable>
          ))}
        </View>
        <View style={estilos.dos}>
          <Text style={[estilos.nombre, { flex: 1 }]}>Los precios ya incluyen el ITBIS ({ITBIS_PCT} %)</Text>
          <Switch value={conItbis} onValueChange={(v) => cambiarPrecios(nivel, v)} trackColor={{ true: color.primario }} />
        </View>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Agregar línea</Etiqueta>
        <View style={estilos.chips}>
          {SECCIONES.map((s) => (
            <Pressable key={s.tipo} style={[estilos.opcion, tipo === s.tipo && estilos.activa]} onPress={() => setTipo(s.tipo)}>
              <Text style={[estilos.textoOpcion, tipo === s.tipo && estilos.textoActivo]}>{s.tipo === 'equipo' ? 'Equipo' : 'Servicio'}</Text>
            </Pressable>
          ))}
        </View>
        <Campo placeholder="Descripción (ej. Instalación por punto)" value={descripcion} onChangeText={setDescripcion} />
        <View style={estilos.dos}>
          <Campo style={estilos.mitad} placeholder="Cantidad" keyboardType="number-pad" value={cantidad} onChangeText={setCantidad} />
          <Campo style={estilos.mitad} placeholder="Precio" keyboardType="decimal-pad" value={precio} onChangeText={setPrecio} />
        </View>
        <Boton texto="Agregar" onPress={agregar} />
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.dos}>
          <Text style={estilos.nombre}>Impuesto (%)</Text>
          <Campo
            style={estilos.impuesto}
            keyboardType="decimal-pad"
            value={impuesto}
            onChangeText={setImpuesto}
            onEndEditing={() => guardarImpuesto(db, proyectoId, pct)}
          />
        </View>
        <Text style={estilos.detalle}>Subtotal{conItbis ? ' (sin ITBIS)' : ''}: {formatear(t.subtotal)}</Text>
        <Text style={estilos.detalle}>Impuesto: {formatear(t.impuesto)}</Text>
        <Text style={estilos.total}>Total: {formatear(t.total)}</Text>
        {hayCostos ? <Text style={[estilos.detalle, { color: color.ok }]}>Ganancia estimada (solo tú la ves): {formatear(ganancia)}</Text> : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Condiciones (salen en el PDF)</Etiqueta>
        <Campo
          multilinea
          value={condiciones}
          onChangeText={setCondiciones}
          onEndEditing={() => guardarCondiciones(db, proyectoId, condiciones)}
        />
        <Boton texto="Compartir PDF" onPress={pdf} />
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  dos: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  mitad: { flex: 1 },
  impuesto: { width: 90, textAlign: 'right' },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto, flexShrink: 1 },
  importe: { fontSize: 16, fontWeight: '700', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  total: { fontSize: 22, fontWeight: '700', color: color.texto },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
  vacio: { textAlign: 'center', color: color.suave },
  chips: { gap: 8, flexDirection: 'row' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.primario },
  textoChip: { color: color.primario, fontWeight: '600' },
  opcion: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.fondo },
  activa: { backgroundColor: color.primario },
  textoOpcion: { color: color.texto },
  textoActivo: { color: '#fff', fontWeight: '600' },
});
