import * as ImagePicker from 'expo-image-picker';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { intentar } from '@/accion';
import { Alert } from '@/alert';
import { listarCatalogo, type Producto } from '@/db/catalogo';
import { listarLineas, obtenerOpciones } from '@/db/cotizacion';
import { crearPartida, eliminarPartida, listarPartidas, type Partida } from '@/db/levantamiento';
import { formatear, moneda, precioParaProyecto, totales } from '@/dinero';
import { guardarFoto, uriFoto } from '@/fotos';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

const MAX_SUGERENCIAS = 12;

export default function Levantamiento() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [opciones, setOpciones] = useState({ nivel: 1, con_itbis: false, impuesto_pct: 18 });
  const [busqueda, setBusqueda] = useState('');
  const [area, setArea] = useState('');
  const [equipo, setEquipo] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setPartidas(await listarPartidas(db, proyectoId));
    setInventario(await listarCatalogo(db));
    const op = await obtenerOpciones(db, proyectoId);
    setOpciones(op);
    setTotal(totales(await listarLineas(db, proyectoId), op.impuesto_pct, op.con_itbis).total);
  }, [db, proyectoId]);
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  // un equipo repetido en varias áreas se muestra una sola vez, con el total y el desglose por área
  const grupos = [...partidas.reduce((m, p) => {
    const clave = p.item_id !== null ? `i${p.item_id}` : `m${p.equipo.trim().toLowerCase()}`;
    const g = m.get(clave) ?? { clave, equipo: p.equipo, total: 0, manual: p.item_id === null, partidas: [] as Partida[] };
    g.total += p.cantidad;
    g.partidas.push(p);
    return m.set(clave, g);
  }, new Map<string, { clave: string; equipo: string; total: number; manual: boolean; partidas: Partida[] }>()).values()];

  const n = Number(cantidad);
  const cantidadValida = Number.isInteger(n) && n >= 1;
  const texto = busqueda.trim().toLowerCase();
  const sugerencias = inventario
    .filter(
      (p) =>
        !texto ||
        p.nombre.toLowerCase().includes(texto) ||
        (p.categoria ?? '').toLowerCase().includes(texto) ||
        (p.codigo ?? '').toLowerCase().includes(texto)
    )
    .slice(0, MAX_SUGERENCIAS);

  async function tomarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) return Alert.alert('Sin permiso', 'Activa la cámara en Ajustes para tomar fotos.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) setFoto(r.assets[0].uri);
  }

  async function agregarDelInventario(p: Producto) {
    if (!area.trim() || !cantidadValida) {
      return Alert.alert('Faltan datos', 'Escribe el área y una cantidad entera mayor a 0 antes de elegir un equipo.');
    }
    const insertar = async () => {
      await crearPartida(
        db,
        proyectoId,
        { area: area.trim(), equipo: p.nombre, cantidad: n, notas: null, foto_uri: null },
        p,
        precioParaProyecto(p, opciones.nivel, opciones.con_itbis, opciones.impuesto_pct)
      );
      setCantidad('1');
      cargar();
    };
    // aviso (no bloqueo) si se pide más de lo que hay en bodega, contando lo que ya se eligió en este levantamiento
    const yaElegido = partidas.filter((x) => x.item_id === p.id).reduce((s, x) => s + x.cantidad, 0);
    if (p.stock !== null && yaElegido + n > p.stock) {
      return Alert.alert('Stock insuficiente', `Hay ${p.stock} de ${p.nombre} en bodega y ya elegiste ${yaElegido}. ¿Agregar ${n} de todos modos?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Agregar', onPress: () => intentar(insertar) },
      ]);
    }
    return insertar();
  }

  async function agregar() {
    if (!area.trim() || !equipo.trim() || !cantidadValida) {
      return Alert.alert('Faltan datos', 'Escribe el área, el equipo y una cantidad entera mayor a 0.');
    }
    await crearPartida(db, proyectoId, {
      area: area.trim(),
      equipo: equipo.trim(),
      cantidad: n,
      notas: notas.trim() || null,
      foto_uri: foto ? guardarFoto(foto) : null,
    });
    setEquipo('');
    setCantidad('1');
    setNotas('');
    setFoto(null);
    cargar();
  }

  function confirmarEliminar(p: Partida) {
    Alert.alert('Eliminar partida', `¿Eliminar ${p.equipo}? También se quita de la cotización.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarPartida(db, p.id);
          cargar();
        },
      },
    ]);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Levantamiento' }} />

      <Link href={{ pathname: '/cotizacion', params: { proyecto: proyectoId } }} asChild>
        <Pressable accessibilityRole="button" style={estilos.resumen}>
          <Text style={estilos.resumenEtiqueta}>Cotización en curso</Text>
          <Text style={estilos.resumenMonto}>{moneda(total)}</Text>
        </Pressable>
      </Link>

      <Boton
        tipo="secundario"
        texto="Dictar pedido (voz)"
        onPress={() => router.push({ pathname: '/pedido', params: { proyecto: proyectoId, area } })}
      />

      <Tarjeta>
        <Etiqueta>Dónde estás</Etiqueta>
        <View style={estilos.fila}>
          <Campo style={{ flex: 1 }} placeholder="Área (ej. Entrada, Bodega)" value={area} onChangeText={setArea} />
          <Campo style={estilos.cantidad} placeholder="Cant." keyboardType="number-pad" value={cantidad} onChangeText={setCantidad} />
        </View>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Elegir del inventario (usa el Precio {opciones.nivel})</Etiqueta>
        <Campo placeholder="Buscar equipo o servicio" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" />
        {inventario.length === 0 ? (
          <Link href="/inventario" style={estilos.enlace}>
            El inventario está vacío. Agrega equipos y servicios aquí.
          </Link>
        ) : null}
        {sugerencias.map((p) => (
          <Pressable key={p.id} style={estilos.sugerencia} onPress={() => intentar(() => agregarDelInventario(p))}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.detalle}>
                {p.codigo ? `${p.codigo} · ` : ''}
                {p.categoria ?? 'Sin categoría'}
                {p.stock !== null ? ` · stock ${p.stock}` : ''}
              </Text>
            </View>
            <Text style={estilos.precio}>{formatear(precioParaProyecto(p, opciones.nivel, opciones.con_itbis, opciones.impuesto_pct))}</Text>
          </Pressable>
        ))}
        {inventario.length > 0 && sugerencias.length === 0 ? <Text style={estilos.detalle}>Sin resultados.</Text> : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>O agrega algo que no está en el inventario</Etiqueta>
        <Campo placeholder="Equipo (ej. Cámara domo 4MP)" value={equipo} onChangeText={setEquipo} />
        <Campo placeholder="Notas" value={notas} onChangeText={setNotas} multilinea />
        {foto && <Image source={{ uri: foto }} style={estilos.foto} />}
        <Boton tipo="secundario" texto={foto ? 'Cambiar foto' : 'Tomar foto'} onPress={tomarFoto} />
        <Boton texto="Agregar partida" onPress={agregar} />
      </Tarjeta>

      <Etiqueta>Partidas ({partidas.length})</Etiqueta>
      {partidas.length === 0 && (
        <Text style={estilos.vacio}>Aún no hay partidas. Elige del inventario o agrega el primer equipo que viste en el sitio.</Text>
      )}
      {grupos.map((g) => (
        <Tarjeta key={g.clave} style={{ gap: 6 }}>
          <View style={estilos.encabezadoGrupo}>
            <Text style={[estilos.nombre, { flex: 1 }]}>
              {g.total} × {g.equipo}
            </Text>
            {g.manual ? <Text style={estilos.aviso}>Sin precio</Text> : null}
          </View>
          {g.partidas.map((p) => (
            <Pressable
              key={p.id}
              style={estilos.area}
              accessibilityRole="button"
              accessibilityHint="Mantén presionado para eliminar"
              onLongPress={() => confirmarEliminar(p)}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.detalle}>
                  {p.area} · {p.cantidad}
                </Text>
                {p.notas ? <Text style={estilos.detalle}>{p.notas}</Text> : null}
              </View>
              {p.foto_uri ? <Image source={{ uri: uriFoto(p.foto_uri) }} style={estilos.miniatura} /> : null}
            </Pressable>
          ))}
        </Tarjeta>
      ))}
      {partidas.length > 0 && <Text style={estilos.pista}>Mantén presionada un área para eliminarla. Los equipos repetidos se suman en una sola tarjeta.</Text>}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  resumen: { padding: 14, borderRadius: 14, backgroundColor: color.primario, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumenEtiqueta: { color: '#fff', fontSize: 15 },
  resumenMonto: { color: '#fff', fontSize: 20, fontWeight: '800' },
  fila: { flexDirection: 'row', gap: 8 },
  cantidad: { width: 72, textAlign: 'center' },
  sugerencia: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borde },
  enlace: { color: color.primario, fontSize: 15 },
  foto: { width: '100%', height: 180, borderRadius: 12 },
  encabezadoGrupo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  area: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borde },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  precio: { fontSize: 16, fontWeight: '700', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  aviso: { fontSize: 12, color: color.alerta },
  miniatura: { width: 56, height: 56, borderRadius: 10 },
  vacio: { textAlign: 'center', color: color.suave, marginVertical: 8 },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
