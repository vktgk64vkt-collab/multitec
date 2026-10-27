import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { entenderConClaude, leerClave } from '@/claude';
import { listarCatalogo, type Producto } from '@/db/catalogo';
import { obtenerOpciones } from '@/db/cotizacion';
import { crearPartida } from '@/db/levantamiento';
import { precioParaProyecto } from '@/dinero';
import { entenderLocal, separarApodos, type ArticuloPedido, type ResultadoPedido } from '@/pedido';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta } from '@/ui';

interface Revision {
  clave: number;
  texto: string;
  item: Producto | null;
  cantidad: number;
  area: string;
  alternativas: Producto[];
  manual: boolean; // agregar tal cual se dictó, sin artículo del inventario (queda sin precio)
}

const aArticulo = (p: Producto): ArticuloPedido => ({ id: p.id, nombre: p.nombre, apodos: separarApodos(p.apodos), tipo: p.tipo });
const capitalizar = (t: string) => t.trim().charAt(0).toUpperCase() + t.trim().slice(1);

/** Dictar un pedido: se entiende, se revisa con los nombres reales del inventario y recién entonces se agrega al levantamiento. */
export default function Pedido() {
  const db = useSQLiteContext();
  const { proyecto, area: areaInicial } = useLocalSearchParams<{ proyecto: string; area?: string }>();
  const proyectoId = Number(proyecto);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [conClave, setConClave] = useState(false);
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState(areaInicial ?? '');
  const [revision, setRevision] = useState<Revision[] | null>(null);
  const [notas, setNotas] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listarCatalogo(db).then(setInventario);
      leerClave().then((c) => setConClave(!!c));
    }, [db])
  );

  const porId = new Map(inventario.map((p) => [p.id, p]));

  function armarRevision(r: ResultadoPedido) {
    if (r.lineas.length === 0) return Alert.alert('No entendí ningún equipo', 'Prueba dictando de nuevo, por ejemplo: "3 cámaras turret y un gabinete 4u pequeño".');
    setNotas(r.notas);
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

  async function entender(conClaude: boolean) {
    if (!texto.trim()) return Alert.alert('Falta el pedido', 'Escribe o dicta lo que necesitas. Con el micrófono del teclado del iPhone puedes hablar.');
    if (inventario.length === 0) return Alert.alert('El inventario está vacío', 'Primero agrega tus equipos y servicios en Más, Inventario.');
    const articulos = inventario.map(aArticulo);
    armarRevision(conClaude ? await entenderConClaude(texto, articulos, area.trim() || null) : entenderLocal(texto, articulos));
  }

  const cambiar = (clave: number, cambio: Partial<Revision>) => setRevision((rs) => rs && rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  const quitar = (clave: number) => setRevision((rs) => rs && rs.filter((r) => r.clave !== clave));

  /** Cambia el artículo propuesto por una de las alternativas; el anterior pasa a ser alternativa. */
  function elegirAlternativa(r: Revision, nuevo: Producto) {
    cambiar(r.clave, { item: nuevo, manual: false, alternativas: [...(r.item ? [r.item] : []), ...r.alternativas.filter((a) => a.id !== nuevo.id)].slice(0, 3) });
  }

  const listas = (revision ?? []).filter((r) => r.item || r.manual);
  const sinResolver = (revision ?? []).length - listas.length;

  async function agregar() {
    if (listas.length === 0) return Alert.alert('Nada que agregar', 'Elige un artículo para cada línea, o márcala "Agregar a mano".');
    const op = await obtenerOpciones(db, proyectoId);
    for (const r of listas) {
      const datos = { area: r.area.trim() || 'General', equipo: r.item ? r.item.nombre : capitalizar(r.texto), cantidad: r.cantidad, notas: null, foto_uri: null };
      if (r.item) await crearPartida(db, proyectoId, datos, r.item, precioParaProyecto(r.item, op.nivel, op.con_itbis, op.impuesto_pct));
      else await crearPartida(db, proyectoId, datos);
    }
    router.back();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Dictar pedido' }} />

      <Tarjeta>
        <Etiqueta>Dicta lo que necesitas</Etiqueta>
        <Campo
          placeholder='Toca el micrófono del teclado y habla. Ej: "en la entrada 3 cámaras turret, un gabinete 4u pequeño y 3 puntos de instalación"'
          value={texto}
          onChangeText={setTexto}
          multilinea
          autoFocus
          style={{ minHeight: 110 }}
        />
        <Etiqueta>Área (si no la mencionas al dictar)</Etiqueta>
        <Campo placeholder="Ej. Entrada, Bodega" value={area} onChangeText={setArea} />
        {conClave ? (
          <>
            <Boton texto="Entender con Claude" onPress={() => entender(true)} />
            <Boton tipo="secundario" texto="Entender sin Claude (gratis, sin internet)" onPress={() => entender(false)} />
          </>
        ) : (
          <>
            <Boton texto="Entender pedido" onPress={() => entender(false)} />
            <Link href="/asistente" style={estilos.enlace}>
              Con Claude se entienden frases más complejas. Agrega tu clave de API.
            </Link>
          </>
        )}
      </Tarjeta>

      {revision ? (
        <>
          <Etiqueta>Revisa antes de agregar</Etiqueta>
          {notas ? <Text style={estilos.nota}>{notas}</Text> : null}
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
              <Text style={estilos.detalle}>Dictado: «{r.texto}» · Área: {r.area}</Text>

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
          <Boton texto={`Agregar ${listas.length} línea${listas.length === 1 ? '' : 's'} al levantamiento`} onPress={agregar} />
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
  aviso: { fontSize: 13, color: color.alerta, fontWeight: '600' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paso: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.fondo, alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, color: color.texto },
  cantidad: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '700', color: color.texto },
});
