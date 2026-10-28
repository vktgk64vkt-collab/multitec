import { Link, type Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptico } from '@/accion';
import { Alert } from '@/alert';
import { FilaDeslizable } from '@/deslizar';
import { eliminarProyecto, fotosDelProyecto, PRIORIDADES, type Proyecto } from '@/db/proyectos';
import { borrarFotos } from '@/fotos';
import { color, colorEstado, tarjeta } from '@/tema';
import { Aparece, Icono, Presionable } from '@/ui';

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
export function FilaProyecto({
  proyecto,
  detalle,
  href,
  onEliminar,
  accion,
}: {
  proyecto: Proyecto;
  detalle?: string;
  href: Href;
  onEliminar?: () => unknown;
  /** Un botón de un toque en la propia fila (por ejemplo "Aprobada"): solo icono, con el texto para VoiceOver. */
  accion?: { texto: string; onPress: () => unknown; icono?: Parameters<typeof Icono>[0]['nombre'] };
}) {
  const fila = (
    <Link href={href} asChild>
      <Presionable accessibilityRole="button" accessibilityLabel={`${proyecto.nombre}, ${proyecto.cliente}`} hundir={0.98} style={[tarjeta, estilos.fila]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={estilos.nombre}>{proyecto.nombre}</Text>
          <Text style={estilos.detalle}>
            {proyecto.cliente} · {proyecto.tipo}
          </Text>
          {detalle ? <Text style={estilos.linea}>{detalle}</Text> : null}
        </View>
        <View style={estilos.derecha}>
          <InsigniaPrioridad prioridad={proyecto.prioridad} />
          <Text style={[estilos.estado, { color: colorEstado[proyecto.aprobado_en ? proyecto.estado : proyecto.cot_estado] ?? color.primario }]}>
            {proyecto.aprobado_en ? proyecto.estado : proyecto.cot_estado}
          </Text>
          {accion ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${accion.texto}: ${proyecto.nombre}`}
              hitSlop={8}
              style={estilos.accion}
              onPress={() => {
                haptico();
                accion.onPress();
              }}>
              <Icono nombre={accion.icono ?? 'checkmark'} tam={18} tinte="#fff" />
            </Pressable>
          ) : null}
        </View>
      </Presionable>
    </Link>
  );
  return <Aparece>{onEliminar ? <FilaDeslizable onAccion={onEliminar}>{fila}</FilaDeslizable> : fila}</Aparece>;
}

/** Pide confirmación y borra el proyecto; uno con factura no se borra (se anula la factura). `despues` recarga la lista. */
export function confirmarEliminarProyecto(db: SQLiteDatabase, p: Proyecto, despues: () => unknown) {
  Alert.alert('Eliminar proyecto', `¿Eliminar ${p.nombre}? Se borran su levantamiento, cotización y bitácora. No se puede deshacer.`, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Eliminar',
      style: 'destructive',
      onPress: async () => {
        const fotos = await fotosDelProyecto(db, p.id);
        if (await eliminarProyecto(db, p.id)) {
          borrarFotos(fotos);
          despues();
        }
        else Alert.alert('Tiene factura', 'Un proyecto con factura no se borra. Anula la factura si fue un error; el NCF queda registrado.');
      },
    },
  ]);
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  linea: { fontSize: 13, fontWeight: '600', color: color.primario, marginTop: 2 },
  derecha: { alignItems: 'flex-end', gap: 4 },
  estado: { fontSize: 12, fontWeight: '600', color: color.primario, textTransform: 'capitalize' },
  accion: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: color.ok },
  insignia: { fontSize: 11, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  alta: { backgroundColor: color.peligro, color: '#ffffff' },
  baja: { backgroundColor: color.fondo, color: color.suave },
});
