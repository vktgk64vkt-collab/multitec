import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cambiarEstado, duplicarProyecto, ESTADOS, obtenerProyecto, type Proyecto } from '@/db/proyectos';
import { color, tarjeta } from '@/tema';
import { Boton, Etiqueta } from '@/ui';

const PASOS = [
  { ruta: '/levantamiento', titulo: 'Levantamiento', detalle: 'Equipos y fotos del sitio' },
  { ruta: '/cotizacion', titulo: 'Cotización', detalle: 'Líneas, descuentos e impuesto' },
  { ruta: '/factura', titulo: 'Factura', detalle: 'NCF, pagos y vencimiento' },
  { ruta: '/bitacora', titulo: 'Bitácora', detalle: 'Visitas y avances' },
] as const;

export default function DetalleProyecto() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerProyecto(db, Number(id)).then(setProyecto);
    }, [db, id])
  );

  if (!proyecto) return null;

  async function elegirEstado(estado: string) {
    await cambiarEstado(db, Number(id), estado);
    setProyecto((p) => p && { ...p, estado });
  }

  async function duplicar() {
    router.replace({ pathname: '/proyecto/[id]', params: { id: await duplicarProyecto(db, Number(id)) } });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{proyecto.nombre}</Text>
      <Text style={estilos.detalle}>
        {proyecto.cliente} · {proyecto.tipo}
      </Text>

      <View style={estilos.pasos}>
        {PASOS.map((p) => (
          <Link key={p.ruta} href={{ pathname: p.ruta, params: { proyecto: proyecto.id } }} asChild>
            <Pressable accessibilityRole="button" style={[tarjeta, estilos.paso]}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>{p.titulo}</Text>
                <Text style={estilos.detalle}>{p.detalle}</Text>
              </View>
              <Text style={estilos.flecha}>›</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <Etiqueta>Estado</Etiqueta>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips}>
        {ESTADOS.map((e) => (
          <Pressable key={e} style={[estilos.chip, e === proyecto.estado && estilos.activa]} onPress={() => elegirEstado(e)}>
            <Text style={[estilos.textoChip, e === proyecto.estado && estilos.textoActivo]}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Boton tipo="secundario" texto="Duplicar proyecto" onPress={duplicar} />
      <Text style={estilos.creado}>Creado: {proyecto.creado_en}</Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  nombre: { fontSize: 28, fontWeight: '800', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  pasos: { gap: 10, marginTop: 4 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 17, fontWeight: '600', color: color.texto },
  flecha: { fontSize: 24, color: color.suave },
  chips: { gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.borde },
  activa: { backgroundColor: color.primario, borderColor: color.primario },
  textoChip: { color: color.texto, textTransform: 'capitalize' },
  textoActivo: { color: '#fff', fontWeight: '600' },
  creado: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
