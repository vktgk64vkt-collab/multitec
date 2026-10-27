import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIORIDADES, type Proyecto } from '@/db/proyectos';
import { color, tarjeta } from '@/tema';

/** Solo se destacan las prioridades que se salen de lo normal: la media no lleva insignia. */
export function InsigniaPrioridad({ prioridad }: { prioridad: number }) {
  if (prioridad === 1) return null;
  const alta = prioridad === 2;
  return (
    <Text style={[estilos.insignia, alta ? estilos.alta : estilos.baja]} accessibilityLabel={`Prioridad ${PRIORIDADES[prioridad]}`}>
      {alta ? 'ALTA' : 'BAJA'}
    </Text>
  );
}

/** Tarjeta de un proyecto para las listas: nombre, cliente, prioridad, estado y una línea propia de cada pantalla. */
export function FilaProyecto({ proyecto, detalle, href }: { proyecto: Proyecto; detalle?: string; href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${proyecto.nombre}, ${proyecto.cliente}`} style={[tarjeta, estilos.fila]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={estilos.nombre}>{proyecto.nombre}</Text>
          <Text style={estilos.detalle}>
            {proyecto.cliente} · {proyecto.tipo}
          </Text>
          {detalle ? <Text style={estilos.linea}>{detalle}</Text> : null}
        </View>
        <View style={estilos.derecha}>
          <InsigniaPrioridad prioridad={proyecto.prioridad} />
          <Text style={estilos.estado}>{proyecto.estado}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 17, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  linea: { fontSize: 13, fontWeight: '600', color: color.primario, marginTop: 2 },
  derecha: { alignItems: 'flex-end', gap: 4 },
  estado: { fontSize: 12, fontWeight: '600', color: color.primario, textTransform: 'capitalize' },
  insignia: { fontSize: 11, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  alta: { backgroundColor: '#c0262d', color: '#ffffff' },
  baja: { backgroundColor: color.fondo, color: color.suave },
});
