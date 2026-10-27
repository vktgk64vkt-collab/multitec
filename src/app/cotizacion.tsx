import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Alert } from '@/alert';
import {
  actualizarPrecio,
  crearLinea,
  eliminarLinea,
  guardarImpuesto,
  importarDelLevantamiento,
  listarLineas,
  obtenerImpuesto,
  type Linea,
} from '@/db/cotizacion';
import { obtenerProyecto } from '@/db/proyectos';
import { aCentavos, formatear, totales } from '@/dinero';
import { compartirPdf } from '@/pdf';

export default function Cotizacion() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [impuesto, setImpuesto] = useState('0');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');

  const cargar = useCallback(
    () =>
      listarLineas(db, proyectoId).then((ls) => {
        setLineas(ls);
        setPrecios(Object.fromEntries(ls.map((l) => [l.id, l.precio_cts ? String(l.precio_cts / 100) : ''])));
      }),
    [db, proyectoId]
  );

  useEffect(() => {
    cargar();
    obtenerImpuesto(db, proyectoId).then((p) => setImpuesto(String(p)));
  }, [cargar, db, proyectoId]);

  const pct = Number(impuesto) >= 0 && Number.isFinite(Number(impuesto)) ? Number(impuesto) : 0;
  const t = totales(lineas, pct);

  async function guardarPrecio(l: Linea) {
    const cts = aCentavos(precios[l.id] ?? '');
    if (cts === null) return cargar();
    await actualizarPrecio(db, l.id, cts);
    setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, precio_cts: cts } : x)));
  }

  async function agregar() {
    const n = Number(cantidad);
    const cts = aCentavos(precio);
    if (!descripcion.trim() || !Number.isInteger(n) || n < 1 || cts === null) {
      return Alert.alert('Faltan datos', 'Descripción, cantidad entera mayor a 0 y precio válido.');
    }
    await crearLinea(db, proyectoId, descripcion.trim(), n, cts);
    setDescripcion('');
    setCantidad('1');
    setPrecio('');
    cargar();
  }

  async function pdf() {
    const p = await obtenerProyecto(db, proyectoId);
    if (!p || lineas.length === 0) return Alert.alert('Nada que compartir', 'Agrega líneas a la cotización primero.');
    const ok = await compartirPdf({
      titulo: 'Cotización',
      cliente: p.cliente,
      proyecto: p.nombre,
      lineas,
      ...t,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
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
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Cotización' }} />

      {lineas.length === 0 && (
        <Pressable
          style={estilos.boton}
          onPress={async () => {
            await importarDelLevantamiento(db, proyectoId);
            cargar();
          }}>
          <Text style={estilos.textoBoton}>Importar del levantamiento</Text>
        </Pressable>
      )}

      {lineas.map((l) => (
        <Pressable key={l.id} style={estilos.fila} onLongPress={() => confirmarEliminar(l)}>
          <View style={estilos.filaTexto}>
            <Text style={estilos.nombre}>{l.descripcion}</Text>
            <Text style={estilos.detalle}>
              {l.cantidad} × {formatear(l.precio_cts)} = {formatear(l.cantidad * l.precio_cts)}
            </Text>
          </View>
          <TextInput
            style={estilos.precio}
            placeholder="Precio"
            keyboardType="decimal-pad"
            value={precios[l.id] ?? ''}
            onChangeText={(v) => setPrecios((p) => ({ ...p, [l.id]: v }))}
            onEndEditing={() => guardarPrecio(l)}
          />
        </Pressable>
      ))}

      <Text style={estilos.etiqueta}>Agregar línea</Text>
      <TextInput style={estilos.campo} placeholder="Descripción (ej. Mano de obra)" value={descripcion} onChangeText={setDescripcion} />
      <View style={estilos.dos}>
        <TextInput style={[estilos.campo, estilos.mitad]} placeholder="Cantidad" keyboardType="number-pad" value={cantidad} onChangeText={setCantidad} />
        <TextInput style={[estilos.campo, estilos.mitad]} placeholder="Precio" keyboardType="decimal-pad" value={precio} onChangeText={setPrecio} />
      </View>
      <Pressable style={[estilos.boton, estilos.secundario]} onPress={agregar}>
        <Text style={estilos.textoSecundario}>Agregar</Text>
      </Pressable>

      <View style={estilos.totales}>
        <View style={estilos.dos}>
          <Text style={estilos.nombre}>Impuesto (%)</Text>
          <TextInput
            style={[estilos.campo, estilos.impuesto]}
            keyboardType="decimal-pad"
            value={impuesto}
            onChangeText={setImpuesto}
            onEndEditing={() => guardarImpuesto(db, proyectoId, pct)}
          />
        </View>
        <Text style={estilos.detalle}>Subtotal: {formatear(t.subtotal)}</Text>
        <Text style={estilos.detalle}>Impuesto: {formatear(t.impuesto)}</Text>
        <Text style={estilos.total}>Total: {formatear(t.total)}</Text>
        <Pressable style={[estilos.boton, estilos.separado]} onPress={pdf}>
          <Text style={estilos.textoBoton}>Compartir PDF</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  campo: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  dos: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  mitad: { flex: 1 },
  impuesto: { width: 90, textAlign: 'right' },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center' },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#12292d' },
  textoSecundario: { color: '#12292d', fontSize: 16, fontWeight: '600' },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 12 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#999',
  },
  filaTexto: { flex: 1 },
  nombre: { fontSize: 16, fontWeight: '600' },
  detalle: { fontSize: 14, opacity: 0.7, marginTop: 2 },
  precio: {
    width: 100,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    textAlign: 'right',
  },
  totales: { marginTop: 16, gap: 4 },
  separado: { marginTop: 12 },
  total: { fontSize: 22, fontWeight: '700', marginTop: 4 },
});
