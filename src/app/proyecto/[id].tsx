import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { resumenProyecto, type ResumenProyecto } from '@/db/resumen';
import { cambiarEstado, duplicarProyecto, eliminarProyecto, ESTADOS, obtenerProyecto, type Proyecto } from '@/db/proyectos';
import { formatearFecha, moneda } from '@/dinero';
import { color, tarjeta } from '@/tema';
import { Boton, Chip, Etiqueta } from '@/ui';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function DetalleProyecto() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [resumen, setResumen] = useState<ResumenProyecto | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerProyecto(db, Number(id)).then(setProyecto);
      resumenProyecto(db, Number(id)).then(setResumen);
    }, [db, id])
  );

  if (!proyecto) return null;

  // línea de estado de cada paso: lo que ya hay hecho, sin entrar a la pantalla
  const pasos = [
    {
      ruta: '/levantamiento',
      titulo: 'Levantamiento',
      detalle: resumen && resumen.partidas > 0 ? plural(resumen.partidas, 'partida', 'partidas') : 'Equipos y fotos del sitio',
    },
    {
      ruta: '/cotizacion',
      titulo: 'Cotización',
      detalle: resumen && resumen.lineas > 0 ? `${plural(resumen.lineas, 'línea', 'líneas')} · ${moneda(resumen.total_cts)}` : 'Líneas, descuentos e impuesto',
    },
    {
      ruta: '/propuesta',
      titulo: 'Propuesta',
      detalle: resumen && resumen.lineas > 0 ? `Monto total ${moneda(resumen.total_cts)}` : 'Todo el alcance con un solo monto total',
    },
    {
      ruta: '/factura',
      titulo: 'Factura',
      detalle: !resumen?.factura
        ? 'NCF, pagos y vencimiento'
        : resumen.factura.anulada
          ? `${resumen.factura.ncf} · anulada`
          : `${resumen.factura.ncf} · ${resumen.factura.saldo_cts > 0 ? `saldo ${moneda(resumen.factura.saldo_cts)}` : 'pagada'}`,
    },
    {
      ruta: '/bitacora',
      titulo: 'Bitácora',
      detalle: resumen && resumen.entradas > 0 ? plural(resumen.entradas, 'entrada', 'entradas') : 'Visitas y avances',
    },
  ] as const;

  async function elegirEstado(estado: string) {
    await cambiarEstado(db, Number(id), estado);
    setProyecto((p) => p && { ...p, estado });
  }

  async function duplicar() {
    router.replace({ pathname: '/proyecto/[id]', params: { id: await duplicarProyecto(db, Number(id)) } });
  }

  function confirmarEliminar() {
    if (resumen?.factura) {
      return Alert.alert('Tiene factura', 'Un proyecto con factura no se borra. Anula la factura si fue un error; el NCF queda registrado.');
    }
    Alert.alert('Eliminar proyecto', `¿Eliminar ${proyecto?.nombre}? Se borran su levantamiento, cotización y bitácora. No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarProyecto(db, Number(id));
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{proyecto.nombre}</Text>
      <Text style={estilos.detalle}>
        {proyecto.cliente} · {proyecto.tipo}
      </Text>

      <View style={estilos.pasos}>
        {pasos.map((p) => (
          <Link key={p.ruta} href={{ pathname: p.ruta, params: { proyecto: proyecto.id } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`${p.titulo}. ${p.detalle}`} style={[tarjeta, estilos.paso]}>
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
          <Chip key={e} borde texto={e} activo={e === proyecto.estado} onPress={() => elegirEstado(e)} />
        ))}
      </ScrollView>

      <Boton tipo="secundario" texto="Duplicar proyecto" onPress={duplicar} />
      <Boton tipo="peligro" texto="Eliminar proyecto" onPress={confirmarEliminar} />
      <Text style={estilos.creado}>Creado: {formatearFecha(proyecto.creado_en)}</Text>
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
  creado: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
