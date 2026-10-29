import { textoCobro } from '@/cobroAuto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AvisoEjecucion, useEjecucionIniciada } from '@/bloqueo';
import { intentar } from '@/accion';
import { Alert } from '@/alert';
import { revisarCotizacionConClaude } from '@/claude';
import { obtenerCliente } from '@/db/clientes';
import type { Observacion } from '@/ia';
import { empresaActual, ofrecerWhatsApp, redactar } from '@/mensajeIA';
import { listarCatalogo, type Producto, type TipoItem } from '@/db/catalogo';
import {
  actualizarPrecio,
  aplicarPrecios,
  contarPartidasPendientes,
  crearLinea,
  eliminarLinea,
  guardarDescuentoGlobal,
  guardarImpuesto,
  importarDelLevantamiento,
  listarLineas,
  listarTrabajos,
  moverLinea,
  obtenerOpciones,
  type Linea,
} from '@/db/cotizacion';
import { aplicarKit, eliminarKit, guardarKit, listarKits, type Kit } from '@/db/kits';
import { listarAreas } from '@/db/levantamiento';
import { aprobarCotizacion, guardarCondiciones, marcarEnviada, obtenerCondiciones, obtenerProyecto } from '@/db/proyectos';
import { aCentavos, diasDesde, fechaEn, formatear, importe, ITBIS_PCT, moneda, precioParaProyecto, totales } from '@/dinero';
import { negocioParaPdf, previsualizar } from '@/pdf';
import { FilaDeslizable } from '@/deslizar';
import { BotonDictado } from '@/dictado';
import { detalleArticulo } from '@/nomenclatura';
import { agruparPorTrabajo, etiquetaTrabajo, hayVariosTrabajos, limpiarTrabajo, trabajoAuto } from '@/trabajos';
import { elegirTrabajoDe, SelectorTrabajo } from '@/trabajosUi';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, FilaAcciones, Tarjeta, PROPS_TECLADO } from '@/ui';

const SECCIONES: { tipo: TipoItem; titulo: string }[] = [
  { tipo: 'equipo', titulo: 'Equipos' },
  { tipo: 'servicio', titulo: 'Mano de obra y servicios' },
];

const MAX_SUGERENCIAS = 8;

export default function Cotizacion() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const aprobada = useEjecucionIniciada(proyectoId);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [pendientes, setPendientes] = useState(0);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [kits, setKits] = useState<Kit[]>([]);
  const [trabajos, setTrabajos] = useState<string[]>([]);
  const [trabajo, setTrabajo] = useState<string | undefined>(undefined); // undefined = Auto
  const [nombreKit, setNombreKit] = useState('');
  const [descuento, setDescuento] = useState('');
  const [descuentoGuardado, setDescuentoGuardado] = useState(0);
  const [impuesto, setImpuesto] = useState('0');
  const [impuestoGuardado, setImpuestoGuardado] = useState(0);
  const [condiciones, setCondiciones] = useState('');
  const [nivel, setNivel] = useState(1);
  const [conItbis, setConItbis] = useState(false);
  const [tipo, setTipo] = useState<TipoItem>('equipo');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');
  const [revisionIA, setRevisionIA] = useState<{ resumen: string; observaciones: Observacion[] } | null>(null);

  const cargar = useCallback(
    () =>
      Promise.all([listarLineas(db, proyectoId), listarTrabajos(db, proyectoId), contarPartidasPendientes(db, proyectoId)]).then(([ls, ts, pendientes]) => {
        setLineas(ls);
        setTrabajos(ts);
        setPrecios(Object.fromEntries(ls.map((l) => [l.id, l.precio_cts ? String(l.precio_cts / 100) : ''])));
        setPendientes(pendientes);
      }),
    [db, proyectoId]
  );

  useEffect(() => {
    cargar();
    listarCatalogo(db).then(setInventario);
    listarKits(db).then(setKits);
    obtenerOpciones(db, proyectoId).then((o) => {
      setImpuesto(String(o.impuesto_pct));
      setImpuestoGuardado(o.impuesto_pct);
      setNivel(o.nivel);
      setConItbis(o.con_itbis);
      setDescuento(o.descuento_pct ? String(o.descuento_pct) : '');
      setDescuentoGuardado(o.descuento_pct);
    });
    obtenerCondiciones(db, proyectoId).then(setCondiciones);
  }, [cargar, db, proyectoId]);

  const pct = Number(impuesto) >= 0 && Number.isFinite(Number(impuesto)) ? Number(impuesto) : 0;
  const descEscrito = Number(descuento.replace(',', '.'));
  const descPct = descEscrito > 0 && descEscrito <= 100 ? descEscrito : 0;
  const t = totales(lineas, pct, conItbis, descPct);
  // la ganancia se mide sin ITBIS: el costo no lo lleva y el impuesto no es tuyo
  const ganancia = lineas.reduce((s, l) => s + (conItbis ? importe(l) / (1 + pct / 100) : importe(l)) - l.cantidad * l.costo_cts, 0);
  const hayCostos = lineas.some((l) => l.costo_cts > 0);
  // con varios trabajos, una sección por trabajo; con uno solo, Equipos y Servicios como siempre
  const secciones = hayVariosTrabajos(lineas)
    ? agruparPorTrabajo(lineas).map((g) => ({ clave: `t${g.trabajo ?? ''}`, titulo: etiquetaTrabajo(g.trabajo), delTipo: g.lineas }))
    : SECCIONES.map((s) => ({ clave: s.tipo, titulo: s.titulo, delTipo: lineas.filter((l) => l.tipo === s.tipo) }));
  const texto = busqueda.trim().toLowerCase();
  const sugerencias = texto
    ? inventario
        .filter((p) => p.nombre.toLowerCase().includes(texto) || (p.codigo ?? '').toLowerCase().includes(texto) || (p.categoria ?? '').toLowerCase().includes(texto))
        .slice(0, MAX_SUGERENCIAS)
    : [];

  async function guardarPrecio(l: Linea) {
    const cts = aCentavos(precios[l.id] ?? '');
    if (cts === null) return cargar();
    await actualizarPrecio(db, l.id, cts);
    setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, precio_cts: cts } : x)));
  }

  async function guardarDescuento() {
    const texto = descuento.trim();
    const d = texto === '' ? 0 : Number(texto.replace(',', '.'));
    if (!Number.isFinite(d) || d < 0 || d > 100) {
      Alert.alert('Descuento inválido', 'Escribe un porcentaje entre 0 y 100, o déjalo vacío.');
      return setDescuento(descuentoGuardado ? String(descuentoGuardado) : '');
    }
    await guardarDescuentoGlobal(db, proyectoId, d);
    setDescuentoGuardado(d);
  }

  async function agregar() {
    const n = Number(cantidad);
    const cts = aCentavos(precio);
    if (!descripcion.trim() || !Number.isInteger(n) || n < 1 || cts === null) {
      return Alert.alert('Faltan datos', 'Escribe la descripción, una cantidad entera mayor a 0 y el precio.');
    }
    await crearLinea(db, proyectoId, { descripcion: descripcion.trim(), cantidad: n, precio_cts: cts, tipo, trabajo: limpiarTrabajo(trabajo) });
    setDescripcion('');
    setCantidad('1');
    setPrecio('');
    cargar();
  }

  async function insertar(p: Producto) {
    await crearLinea(db, proyectoId, {
      descripcion: p.nombre,
      cantidad: 1,
      precio_cts: precioParaProyecto(p, nivel, conItbis, pct),
      tipo: p.tipo,
      costo_cts: p.costo_cts,
      item_id: p.id,
      detalle: detalleArticulo(p),
      trabajo: trabajo === undefined ? trabajoAuto(p.categoria) : limpiarTrabajo(trabajo),
    });
    setBusqueda('');
    cargar();
  }

  function agregarDelInventario(p: Producto) {
    const yaEnCotizacion = lineas.filter((l) => l.item_id === p.id).reduce((s, l) => s + l.cantidad, 0);
    if (p.stock !== null && yaEnCotizacion + 1 > p.stock) {
      return Alert.alert('Stock insuficiente', `Hay ${p.stock} de ${p.nombre} en bodega y ya cotizas ${yaEnCotizacion}. ¿Agregar de todos modos?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Agregar', onPress: () => intentar(() => insertar(p)) },
      ]);
    }
    return insertar(p);
  }

  async function pasarATrabajo(l: Linea, destino: string | null) {
    await moverLinea(db, l.id, destino);
    cargar();
  }

  async function usarKit(k: Kit) {
    await aplicarKit(db, k.id, proyectoId);
    cargar();
  }

  async function nuevoKit() {
    if (!(await guardarKit(db, proyectoId, nombreKit))) {
      return Alert.alert('No se guardó', 'Escribe un nombre para el kit y agrega al menos una línea a la cotización.');
    }
    setNombreKit('');
    setKits(await listarKits(db));
  }

  function confirmarEliminarKit(k: Kit) {
    Alert.alert('Eliminar kit', `¿Eliminar el kit "${k.nombre}"? Las cotizaciones donde ya lo usaste no cambian.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarKit(db, k.id);
          setKits(await listarKits(db));
        },
      },
    ]);
  }

  /** Aprobada: pasa a proyecto, arranca la ejecución y te lleva a él. */
  async function aprobar() {
    if (lineas.length === 0) return Alert.alert('Nada que aprobar', 'Agrega líneas a la cotización primero.');
    if (await aprobarCotizacion(db, proyectoId)) router.replace({ pathname: '/proyecto/[id]', params: { id: proyectoId } });
  }

  /** Claude mira la cotización antes de enviarla: lo que falta, cantidades que no cuadran, márgenes bajos. */
  async function revisar() {
    if (lineas.length === 0) return Alert.alert('Nada que revisar', 'Agrega líneas a la cotización primero.');
    setRevisionIA(
      await revisarCotizacionConClaude(
        lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precio_cts: l.precio_cts, costo_cts: l.costo_cts, tipo: l.tipo, trabajo: l.trabajo }))
      )
    );
  }

  /** Mensaje de WhatsApp para dar seguimiento a la cotización, redactado por Claude (o con plantilla si no hay Claude). */
  async function seguimiento() {
    const p = await obtenerProyecto(db, proyectoId);
    if (!p || lineas.length === 0) return Alert.alert('Nada que dar seguimiento', 'Agrega líneas a la cotización primero.');
    const cliente = await obtenerCliente(db, p.cliente_id);
    const dias = diasDesde(p.enviada_en);
    const firma = (await empresaActual(db)) ?? '';
    const plantilla = `Hola ${p.cliente}, le escribimos para dar seguimiento a la cotización "${p.nombre}" por ${moneda(t.total)}. Quedamos atentos a cualquier duda o ajuste que necesite. Gracias.${firma ? `\n— ${firma}` : ''}`;
    const { texto, claude } = await redactar(db, 'seguimiento', { cliente: p.cliente, trabajo: p.nombre, total: moneda(t.total), enviada: dias === null ? 'aún no enviada' : `hace ${dias} días` }, plantilla);
    ofrecerWhatsApp(cliente?.telefono, texto, claude);
  }

  async function pdf() {
    const p = await obtenerProyecto(db, proyectoId);
    if (!p || lineas.length === 0) return Alert.alert('Nada que compartir', 'Agrega líneas a la cotización primero.');
    previsualizar({
      titulo: `Cotización #${p.id}`,
      fecha: fechaEn(0),
      cliente: p.cliente,
      proyecto: p.nombre,
      negocio: await negocioParaPdf(db),
      areas: await listarAreas(db, proyectoId),
      lineas,
      condiciones,
      preciosConItbis: conItbis,
      impuestoPct: pct,
      descuentoPct: descPct,
      ...t,
    }, () => marcarEnviada(db, proyectoId)); // compartirla la deja como enviada
  }

  /** Cambia nivel y/o modo de ITBIS (con impuesto `pctNuevo`) y reprecia las líneas del inventario, con confirmación. */
  function cambiarPrecios(nuevoNivel: number, nuevoItbis: boolean, pctNuevo = impuestoGuardado) {
    const aplicar = async () => {
      if (pctNuevo !== impuestoGuardado) await guardarImpuesto(db, proyectoId, pctNuevo);
      await aplicarPrecios(db, proyectoId, nuevoNivel, nuevoItbis);
      setImpuestoGuardado(pctNuevo);
      setNivel(nuevoNivel);
      setConItbis(nuevoItbis);
      cargar();
    };
    if (!lineas.some((l) => l.item_id !== null)) return aplicar();
    Alert.alert('Recalcular precios', 'Las líneas que vienen del inventario se recalculan. Las que escribiste a mano no cambian.', [
      { text: 'Cancelar', style: 'cancel', onPress: () => setImpuesto(String(impuestoGuardado)) },
      { text: 'Recalcular', onPress: () => intentar(aplicar) },
    ]);
  }

  async function terminarImpuesto() {
    if (pct === impuestoGuardado) return;
    // con precios con ITBIS incluido, el impuesto del proyecto está dentro de los precios del inventario
    if (conItbis) return cambiarPrecios(nivel, conItbis, pct);
    await guardarImpuesto(db, proyectoId, pct);
    setImpuestoGuardado(pct);
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

  if (aprobada && proyectoId !== null) return <AvisoEjecucion proyectoId={proyectoId} />;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
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
          La cotización está vacía. Elige equipos en el levantamiento, busca en el inventario aquí abajo, o agrega una línea a mano.
        </Text>
      )}

      {secciones.map(({ clave, titulo, delTipo }) => {
        if (delTipo.length === 0) return null;
        return (
          <View key={clave} style={{ gap: 10 }}>
            <View style={estilos.dos}>
              <Etiqueta>{titulo}</Etiqueta>
              <Text style={estilos.detalle}>{moneda(delTipo.reduce((s, l) => s + importe(l), 0))}</Text>
            </View>
            {delTipo.map((l) => (
              <FilaDeslizable key={l.id} onAccion={() => confirmarEliminar(l)}>
                <Tarjeta>
                  <View style={estilos.dos}>
                    <Text style={estilos.nombre}>{l.descripcion}</Text>
                    <Text style={estilos.importe}>{formatear(importe(l))}</Text>
                  </View>
                  {l.detalle ? <Text style={estilos.detalle}>{l.detalle}</Text> : null}
                  <Text style={estilos.detalle}>
                    {l.cantidad} × {formatear(l.precio_cts)}
                    {l.descuento_pct ? ` − ${l.descuento_pct}%` : ''}
                    {l.precio_cts === 0 ? ' · falta el precio' : ''}
                    {l.cobro_auto ? ` · ${textoCobro(l.cobro_auto, l.cobro_param)}` : ''}
                  </Text>
                  <Campo
                    placeholder="Precio"
                    keyboardType="decimal-pad"
                    value={precios[l.id] ?? ''}
                    onChangeText={(v) => setPrecios((p) => ({ ...p, [l.id]: v }))}
                    onEndEditing={() => intentar(() => guardarPrecio(l))}
                  />
                  <Pressable accessibilityRole="button" hitSlop={8} style={estilos.moverTrabajo} onPress={() => elegirTrabajoDe(l.descripcion, trabajos, l.trabajo, (t) => intentar(() => pasarATrabajo(l, t)))}>
                    <Text style={estilos.detalle}>Trabajo: {etiquetaTrabajo(l.trabajo)} ›</Text>
                  </Pressable>
                </Tarjeta>
              </FilaDeslizable>
            ))}
          </View>
        );
      })}
      {lineas.length > 0 && <Text style={estilos.pista}>Desliza una línea hacia la izquierda para eliminarla.</Text>}

      <Tarjeta>
        <SelectorTrabajo trabajos={trabajos} valor={trabajo} onElegir={setTrabajo} />
        <Etiqueta>Buscar en el inventario (nombre o código)</Etiqueta>
        <Campo placeholder="Ej. turret 4MPX o CCTV-0001" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />
        {texto && sugerencias.length === 0 ? <Text style={estilos.detalle}>Sin resultados.</Text> : null}
        {!texto && inventario.length === 0 ? <Text style={estilos.detalle}>El inventario está vacío. Agrégalo en Más, Inventario.</Text> : null}
        {sugerencias.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Agregar ${p.nombre}`}
            style={estilos.sugerencia}
            onPress={() => intentar(() => agregarDelInventario(p))}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.detalle}>
                {p.codigo ? `${p.codigo} · ` : ''}
                {p.stock !== null ? `stock ${p.stock}` : p.categoria ?? ''}
              </Text>
            </View>
            <Text style={estilos.importe}>{formatear(precioParaProyecto(p, nivel, conItbis, pct))}</Text>
          </Pressable>
        ))}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Precios del inventario</Etiqueta>
        <View style={estilos.chips}>
          {[1, 2, 3].map((n) => (
            <Chip key={n} texto={`Precio ${n}`} activo={nivel === n} onPress={() => cambiarPrecios(n, conItbis)} />
          ))}
        </View>
        <View style={estilos.dos}>
          <Text style={[estilos.nombre, { flex: 1 }]}>Los precios ya incluyen el ITBIS</Text>
          <Switch
            accessibilityLabel="Los precios ya incluyen el ITBIS"
            value={conItbis}
            onValueChange={(v) => cambiarPrecios(nivel, v)}
            trackColor={{ true: color.primario }}
          />
        </View>
        {conItbis && pct !== ITBIS_PCT ? (
          <Text style={estilos.aviso}>Impuesto del proyecto: {pct} %. Los precios del inventario se calculan con ese impuesto.</Text>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Kits (paquetes que se agregan de una vez)</Etiqueta>
        {kits.length === 0 ? <Text style={estilos.detalle}>Arma la cotización una vez, ponle un nombre abajo y queda como kit para las siguientes.</Text> : null}
        {kits.map((k) => (
          <FilaDeslizable key={k.id} onAccion={() => confirmarEliminarKit(k)}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Agregar el kit ${k.nombre}`} style={estilos.sugerencia} onPress={() => intentar(() => usarKit(k))}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nombre}>{k.nombre}</Text>
                <Text style={estilos.detalle}>{k.lineas} {k.lineas === 1 ? 'línea' : 'líneas'}</Text>
              </View>
              <Text style={estilos.importe}>+ Agregar</Text>
            </Pressable>
          </FilaDeslizable>
        ))}
        {lineas.length > 0 ? (
          <View style={estilos.dos}>
            <Campo style={estilos.mitad} placeholder="Nombre para guardar como kit" value={nombreKit} onChangeText={setNombreKit} />
            <Chip borde texto="Guardar kit" onPress={() => intentar(nuevoKit)} />
          </View>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Agregar línea</Etiqueta>
        <View style={estilos.chips}>
          {SECCIONES.map((s) => (
            <Chip key={s.tipo} texto={s.tipo === 'equipo' ? 'Equipo' : 'Servicio'} activo={tipo === s.tipo} onPress={() => setTipo(s.tipo)} />
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
            onEndEditing={() => intentar(terminarImpuesto)}
          />
        </View>
        <View style={estilos.dos}>
          <Text style={estilos.nombre}>Descuento global (%), opcional</Text>
          <Campo
            style={estilos.impuesto}
            placeholder="0"
            keyboardType="decimal-pad"
            value={descuento}
            onChangeText={setDescuento}
            onEndEditing={() => intentar(guardarDescuento)}
          />
        </View>
        <Text style={estilos.detalle}>Subtotal{conItbis ? ' (sin ITBIS)' : ''}: {moneda(t.subtotal)}</Text>
        {t.descuento > 0 ? <Text style={estilos.detalle}>Descuento ({descPct}%): −{moneda(t.descuento)}</Text> : null}
        <Text style={estilos.detalle}>Impuesto: {moneda(t.impuesto)}</Text>
        <Text style={estilos.total}>Total: {moneda(t.total)}</Text>
        {hayCostos ? <Text style={[estilos.detalle, { color: color.ok }]}>Ganancia estimada (solo tú la ves): {moneda(Math.round(ganancia))}</Text> : null}
      </Tarjeta>

      {revisionIA ? (
        <Tarjeta>
          <Etiqueta>Revisión de Claude</Etiqueta>
          <Text style={estilos.detalle}>{revisionIA.resumen}</Text>
          {revisionIA.observaciones.length === 0 ? <Text style={[estilos.nombre, { color: color.ok }]}>No encontré nada que corregir.</Text> : null}
          {revisionIA.observaciones.map((o, i) => (
            <Text key={i} style={[estilos.revision, { borderLeftColor: o.gravedad === 'alta' ? color.peligro : o.gravedad === 'media' ? color.alerta : color.suave }]}>
              {o.texto}
            </Text>
          ))}
          <Text style={estilos.pista}>Son sugerencias: tú decides qué cambiar.</Text>
        </Tarjeta>
      ) : null}

      <Tarjeta>
        <Etiqueta>Condiciones (salen en el PDF)</Etiqueta>
        <Campo
          multilinea
          value={condiciones}
          onChangeText={setCondiciones}
          onEndEditing={() => intentar(() => guardarCondiciones(db, proyectoId, condiciones))}
        />
        <FilaAcciones
          acciones={[
            { icono: 'square.and.arrow.up', texto: 'PDF', onPress: pdf },
            { icono: 'sparkles', texto: 'Revisar', onPress: revisar },
            { icono: 'message', texto: 'Seguimiento', onPress: seguimiento },
            { icono: 'checkmark.circle.fill', texto: 'Aprobada', onPress: aprobar, tono: 'ok', principal: true },
          ]}
        />
      </Tarjeta>
    </ScrollView>
    <BotonDictado proyectoId={proyectoId} />
    </View>
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
  aviso: { fontSize: 13, color: color.alerta },
  total: { fontSize: 22, fontWeight: '700', color: color.texto },
  revision: { fontSize: 14, color: color.texto, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2 },
  moverTrabajo: { minHeight: 32, justifyContent: 'center' },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
  vacio: { textAlign: 'center', color: color.suave },
  chips: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  sugerencia: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borde },
});
