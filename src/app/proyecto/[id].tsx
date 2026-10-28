import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { resumenProyecto, type ResumenProyecto } from '@/db/resumen';
import {
  aprobarCotizacion,
  cambiarEstado,
  cambiarEstadoCotizacion,
  cambiarPrioridad,
  deshacerAprobacion,
  duplicarProyecto,
  PRIORIDADES,
  reabrirProyecto,
  eliminarProyecto,
  fotosDelProyecto,
  obtenerProyecto,
  type Proyecto,
} from '@/db/proyectos';
import { formatearFecha, moneda } from '@/dinero';
import { borrarFotos } from '@/fotos';
import { siguientePaso, type Paso } from '@/flujo';
import { enlaceDeBusqueda } from '@/ubicacion';
import { BotonDictado } from '@/dictado';
import { color, tarjeta } from '@/tema';
import { Boton, Chip, Etiqueta } from '@/ui';

const RUTAS = { levantamiento: '/levantamiento', cotizacion: '/cotizacion', ejecucion: '/ejecucion', factura: '/factura' } as const;
// los destinos que no abren otra pantalla (aprobar, reabrir, cerrar) se resuelven antes de navegar

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function DetalleProyecto() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [resumen, setResumen] = useState<ResumenProyecto | null>(null);

  const cargar = useCallback(() => {
    obtenerProyecto(db, Number(id)).then(setProyecto);
    resumenProyecto(db, Number(id)).then(setResumen);
  }, [db, id]);
  useFocusEffect(cargar);

  if (!proyecto) return null;

  // sin aprobar es una cotización: solo levantamiento, cotización y propuesta; al aprobarla pasa a proyecto con todo lo demás
  const esCotizacion = !proyecto.aprobado_en;

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
      detalle: resumen && resumen.lineas > 0 ? `${plural(resumen.lineas, 'línea', 'líneas')} · ${moneda(resumen.total_cts)}` : 'Líneas, descuento e impuesto',
    },
    {
      ruta: '/propuesta',
      titulo: 'Propuesta',
      detalle: resumen && resumen.lineas > 0 ? `Monto total ${moneda(resumen.total_cts)}` : 'Todo el alcance con un solo monto total',
    },
    {
      ruta: '/ejecucion',
      titulo: 'Ejecución',
      detalle: resumen?.ejecucion
        ? `${plural(resumen.ejecucion.cambios, 'cambio', 'cambios')} · ${plural(resumen.ejecucion.comprobantes, 'comprobante', 'comprobantes')} · ${moneda(resumen.ejecucion.real_cts)}`
        : 'Cambios del trabajo y comprobantes antes de facturar',
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

  const paso = resumen
    ? siguientePaso({
        estado: proyecto.estado,
        etapa: esCotizacion ? 'cotizacion' : 'proyecto',
        cot_estado: proyecto.cot_estado,
        partidas: resumen.partidas,
        lineas: resumen.lineas,
        total_cts: resumen.total_cts,
        factura: resumen.factura,
        ejecucion: resumen.ejecucion,
      })
    : null;

  async function irAlPaso(p: Paso) {
    if (p.destino === 'cerrar') return elegirEstado('cerrado');
    if (p.destino === 'aprobar') return aprobar();
    if (p.destino === 'reabrir') return elegirRespuesta('borrador');
    router.push({ pathname: RUTAS[p.destino], params: { proyecto: proyecto?.id } });
  }

  async function elegirPrioridad(prioridad: number) {
    await cambiarPrioridad(db, Number(id), prioridad);
    setProyecto((p) => p && { ...p, prioridad });
  }

  async function elegirRespuesta(estado: 'borrador' | 'enviada' | 'rechazada') {
    await cambiarEstadoCotizacion(db, Number(id), estado);
    setProyecto((p) => p && { ...p, cot_estado: estado });
  }

  /** Aprobada: un toque. Pasa a proyecto y se abre la ejecución con las líneas cotizadas. */
  async function aprobar() {
    if (await aprobarCotizacion(db, Number(id))) cargar();
    else Alert.alert('Falta la cotización', 'Agrega al menos una línea a la cotización antes de aprobarla.');
  }

  function confirmarDeshacer() {
    Alert.alert('Volver a cotización', 'La ejecución todavía no tiene cambios, así que se quita y el proyecto vuelve a ser una cotización enviada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Volver',
        onPress: async () => {
          if (await deshacerAprobacion(db, Number(id))) cargar();
          else Alert.alert('Ya hay trabajo registrado', 'Tiene cambios, comprobantes o factura, y no se puede deshacer.');
        },
      },
    ]);
  }

  const mapa = proyecto.ubicacion_url ?? (proyecto.cliente_direccion ? enlaceDeBusqueda(proyecto.cliente_direccion) : null);

  async function reabrir() {
    await reabrirProyecto(db, Number(id));
    cargar();
  }

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
    Alert.alert(esCotizacion ? 'Eliminar cotización' : 'Eliminar proyecto', `¿Eliminar ${proyecto?.nombre}? Se borran su levantamiento, cotización y bitácora. No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const fotos = await fotosDelProyecto(db, Number(id));
          if (await eliminarProyecto(db, Number(id))) borrarFotos(fotos);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Text style={estilos.nombre}>{proyecto.nombre}</Text>
      <Text style={estilos.detalle}>
        {proyecto.cliente} · {proyecto.tipo}
        {esCotizacion ? ` · Cotización ${proyecto.cot_estado}` : ''}
      </Text>

      {mapa ? (
        <Boton tipo="secundario" texto="Cómo llegar" onPress={() => Linking.openURL(mapa).catch(() => Alert.alert('No se pudo abrir', 'Revisa que Google Maps o Safari estén disponibles en este iPhone.'))} />
      ) : null}

      {paso ? (
        <View style={[tarjeta, estilos.siguiente]}>
          <Text style={estilos.siguienteRotulo}>SIGUIENTE PASO</Text>
          <Text style={estilos.siguienteTitulo}>{paso.titulo}</Text>
          <Text style={estilos.detalle}>{paso.detalle}</Text>
          <Boton texto={paso.boton} onPress={() => irAlPaso(paso)} />
        </View>
      ) : null}

      <View style={estilos.pasos}>
        {(esCotizacion ? pasos.slice(0, 3) : pasos).map((p) => (
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

      {esCotizacion ? (
        <>
          <Etiqueta>Respuesta del cliente</Etiqueta>
          <View style={estilos.chips}>
            {(['borrador', 'enviada', 'rechazada'] as const).map((e) => (
              <Chip key={e} borde texto={e} activo={e === proyecto.cot_estado} onPress={() => elegirRespuesta(e)} />
            ))}
          </View>
          {resumen && resumen.lineas > 0 && paso?.destino !== 'aprobar' ? <Boton texto="Aprobada" onPress={aprobar} /> : null}
        </>
      ) : (
        <Boton
          tipo="secundario"
          texto={proyecto.estado === 'cerrado' ? 'Reabrir proyecto' : 'Cerrar proyecto'}
          onPress={() => (proyecto.estado === 'cerrado' ? reabrir() : elegirEstado('cerrado'))}
        />
      )}

      <Etiqueta>Prioridad</Etiqueta>
      <View style={estilos.chips}>
        {[2, 1, 0].map((n) => (
          <Chip key={n} borde texto={PRIORIDADES[n]} activo={proyecto.prioridad === n} onPress={() => elegirPrioridad(n)} />
        ))}
      </View>

      {!esCotizacion && resumen && !resumen.factura && resumen.ejecucion && resumen.ejecucion.cambios === 0 && resumen.ejecucion.comprobantes === 0 ? (
        <Boton tipo="secundario" texto="Volver a cotización (deshacer Aprobada)" onPress={confirmarDeshacer} />
      ) : null}
      <Boton tipo="secundario" texto={esCotizacion ? 'Duplicar cotización' : 'Duplicar proyecto'} onPress={duplicar} />
      <Boton tipo="peligro" texto={esCotizacion ? 'Eliminar cotización' : 'Eliminar proyecto'} onPress={confirmarEliminar} />
      <Text style={estilos.creado}>Creado: {formatearFecha(proyecto.creado_en)}</Text>
    </ScrollView>
    <BotonDictado proyectoId={proyecto.id} />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  nombre: { fontSize: 28, fontWeight: '800', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  pasos: { gap: 10, marginTop: 4 },
  siguiente: { gap: 6, borderLeftWidth: 4, borderLeftColor: color.primario },
  siguienteRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: color.suave },
  siguienteTitulo: { fontSize: 20, fontWeight: '800', color: color.texto },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 17, fontWeight: '600', color: color.texto },
  flecha: { fontSize: 24, color: color.suave },
  chips: { gap: 8 },
  creado: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
