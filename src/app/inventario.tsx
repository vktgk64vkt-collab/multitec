import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import {
  actualizarProducto,
  crearProducto,
  eliminarProducto,
  listarCatalogo,
  sumarStock,
  type DatosProducto,
  type Producto,
} from '@/db/catalogo';
import { aCentavos, formatear, ITBIS_PCT, MARGENES_BASE, precioDesdeCosto, preciosArticulo } from '@/dinero';
import {
  armarNombre,
  CASILLAS,
  FAMILIAS,
  NA,
  NOMBRES_FAMILIAS,
  PARTES_VACIAS,
  sugerenciasEspecificacion,
  type Casilla,
  type Partes,
} from '@/nomenclatura';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta } from '@/ui';

const STOCK_BAJO = 2;
const BASE = MARGENES_BASE.map(String);
const esNA = (t: string) => t.trim().toUpperCase() === NA;

/** "17,5" -> 17.5. null si no es un porcentaje válido (0 a 1000). */
function aPorcentaje(t: string): number | null {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

export default function Inventario() {
  const db = useSQLiteContext();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Producto | null>(null);
  const [familia, setFamilia] = useState(NOMBRES_FAMILIAS[0]);
  const [partes, setPartes] = useState<Partes>(PARTES_VACIAS);
  const [costo, setCosto] = useState('');
  const [margenes, setMargenes] = useState<string[]>(BASE);
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const cargar = useCallback(() => listarCatalogo(db, busqueda).then(setProductos), [db, busqueda]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const f = FAMILIAS[familia];
  const nombre = armarNombre(partes);
  const costoCts = costo.trim() === '' ? 0 : aCentavos(costo);
  const calculado = costoCts !== null && costoCts > 0;
  // artículo anterior sin nomenclatura: si no se llena ninguna casilla se conserva su nombre libre
  const anterior = editando !== null && editando.f_tipo === null;
  const sinCasillas = CASILLAS.every((c) => partes[c].trim() === '');

  function limpiar() {
    setEditando(null);
    setPartes(PARTES_VACIAS);
    setCosto('');
    setMargenes(BASE);
    setPrecio('');
    setStock('');
    setDescripcion('');
  }

  /** Deja el formulario listo para otro artículo parecido: misma familia, casillas y márgenes; sin modelo, costo ni stock. */
  function seguirConSimilar() {
    setEditando(null);
    setPartes((p) => ({ ...p, modelo: '' }));
    setCosto('');
    setPrecio('');
    setStock('');
    setDescripcion('');
  }

  function elegirFamilia(nombreFamilia: string) {
    setFamilia(nombreFamilia);
    setPartes(PARTES_VACIAS);
  }

  function poner(c: Casilla, valor: string) {
    setPartes((p) => ({ ...p, [c]: valor }));
  }

  function cargarEnFormulario(p: Producto) {
    setFamilia(p.categoria && FAMILIAS[p.categoria] ? p.categoria : NOMBRES_FAMILIAS[0]);
    setPartes(
      p.f_tipo === null
        ? PARTES_VACIAS
        : {
            tipo: p.f_tipo,
            tecnologia: p.f_tecnologia ?? NA,
            forma: p.f_forma ?? NA,
            especificacion: p.f_especificacion ?? NA,
            marca: p.f_marca ?? NA,
            modelo: p.f_modelo ?? NA,
          }
    );
    setCosto(p.costo_cts ? String(p.costo_cts / 100) : '');
    setMargenes(p.margen1_pct === null ? BASE : [p.margen1_pct, p.margen2_pct ?? p.margen1_pct, p.margen3_pct ?? p.margen1_pct].map(String));
    setPrecio(p.precio_cts ? String(p.precio_cts / 100) : '');
    setDescripcion(p.descripcion ?? '');
  }

  function editar(p: Producto) {
    setEditando(p);
    cargarEnFormulario(p);
    setStock(p.stock === null ? '' : String(p.stock));
  }

  /** Copia el artículo como uno nuevo (para otro modelo): todo igual menos el modelo y el stock. */
  function duplicar(p: Producto) {
    setEditando(null);
    cargarEnFormulario(p);
    setPartes((x) => ({ ...x, modelo: '' }));
    setStock('');
  }

  async function guardar(seguir = false) {
    const conservar = anterior && sinCasillas;
    if (!conservar) {
      if (nombre === null) {
        const faltan = CASILLAS.filter((c) => partes[c].trim() === '').map((c) => f.etiquetas[c]);
        return Alert.alert(
          faltan.length ? 'Faltan casillas' : 'Tipo inválido',
          faltan.length ? `Completa o marca N/A en: ${faltan.join(', ')}.` : 'El tipo no puede ser N/A.'
        );
      }
      const repetido = (await listarCatalogo(db)).find((x) => x.id !== editando?.id && x.nombre.trim().toLowerCase() === nombre.toLowerCase());
      if (repetido) {
        // equipo repetido: la cantidad se suma al existente (los servicios no se suman, solo se avisa)
        if (editando === null && !f.servicio && repetido.tipo === 'equipo') {
          const cant = Number(stock);
          if (stock.trim() === '' || !Number.isInteger(cant) || cant < 1) {
            return Alert.alert('Ya existe', `${repetido.nombre} (${repetido.codigo}) ya está en el inventario. Escribe la cantidad que ingresas y se suma a su stock.`);
          }
          await sumarStock(db, repetido.id, cant);
          Alert.alert('Cantidad sumada', `${repetido.nombre}\n${repetido.codigo}: +${cant}. Stock total: ${(repetido.stock ?? 0) + cant}.`);
          if (seguir) seguirConSimilar();
          else limpiar();
          return cargar();
        }
        return Alert.alert('Ya existe', `Ese artículo ya está en el inventario:\n${repetido.nombre} (${repetido.codigo})`);
      }
    }
    if (costoCts === null) return Alert.alert('Costo inválido', 'Escribe un número, o deja el costo vacío y escribe un precio fijo.');
    const n = stock.trim() === '' || f.servicio ? null : Number(stock);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      return Alert.alert('Stock inválido', 'El stock es un número entero, 0 o mayor. Déjalo vacío si no llevas conteo.');
    }

    let precios: Pick<DatosProducto, 'precio_cts' | 'costo_cts' | 'margen1_pct' | 'margen2_pct' | 'margen3_pct'>;
    if (calculado) {
      const m = margenes.map(aPorcentaje);
      if (m.some((x) => x === null)) return Alert.alert('Margen inválido', 'Escribe los 3 márgenes como porcentaje, por ejemplo 15.');
      precios = { precio_cts: precioDesdeCosto(costoCts, m[0] as number), costo_cts: costoCts, margen1_pct: m[0], margen2_pct: m[1], margen3_pct: m[2] };
    } else {
      const cts = aCentavos(precio);
      if (cts === null) return Alert.alert('Falta el precio', 'Sin costo, escribe el precio fijo de venta.');
      precios = { precio_cts: cts, costo_cts: 0, margen1_pct: null, margen2_pct: null, margen3_pct: null };
    }

    const datos: DatosProducto = conservar
      ? { ...(editando as Producto), ...precios, stock: n, descripcion: descripcion.trim() || null }
      : {
          nombre: nombre as string,
          tipo: f.servicio ? 'servicio' : 'equipo',
          categoria: familia,
          stock: n,
          descripcion: descripcion.trim() || null,
          ...precios,
          f_tipo: partes.tipo.trim(),
          f_tecnologia: esNA(partes.tecnologia) ? null : partes.tecnologia.trim(),
          f_forma: esNA(partes.forma) ? null : partes.forma.trim(),
          f_especificacion: esNA(partes.especificacion) ? null : partes.especificacion.trim(),
          f_marca: esNA(partes.marca) ? null : partes.marca.trim(),
          f_modelo: esNA(partes.modelo) ? null : partes.modelo.trim(),
        };
    if (editando === null) await crearProducto(db, datos);
    else await actualizarProducto(db, editando.id, datos);
    if (seguir && editando === null) seguirConSimilar();
    else limpiar();
    cargar();
  }

  function confirmarEliminar(p: Producto) {
    Alert.alert('Eliminar del inventario', `¿Eliminar ${p.nombre}? Las cotizaciones que ya lo usan no cambian.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarProducto(db, p.id);
          if (editando?.id === p.id) limpiar();
          cargar();
        },
      },
    ]);
  }

  function opciones(c: Casilla): string[] {
    if (c === 'tipo') return f.tipos;
    if (c === 'tecnologia') return f.tecnologias;
    if (c === 'forma') return f.formas;
    if (c === 'especificacion') return sugerenciasEspecificacion(f, partes.tipo.trim());
    if (c === 'marca') return f.marcas;
    return [];
  }

  const formulario = (
    <View style={estilos.encabezado}>
      <Stack.Screen options={{ title: 'Inventario' }} />
      <Tarjeta>
        <Etiqueta>{editando === null ? 'Nuevo artículo' : 'Editando'}</Etiqueta>
        {anterior ? (
          <Text style={estilos.aviso}>
            Este artículo tiene nombre libre: «{editando?.nombre}». Llena las casillas para estandarizarlo, o déjalas vacías para conservarlo.
          </Text>
        ) : null}

        <Etiqueta>Familia</Etiqueta>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila} keyboardShouldPersistTaps="handled">
          {NOMBRES_FAMILIAS.map((n) => (
            <Chip key={n} texto={n} activo={n === familia} onPress={() => elegirFamilia(n)} />
          ))}
        </ScrollView>

        {CASILLAS.map((c) => {
          const lista = opciones(c);
          const noAplica = esNA(partes[c]);
          return (
            <View key={c} style={estilos.casilla}>
              <Etiqueta>{f.etiquetas[c]}</Etiqueta>
              <Campo
                placeholder={c === 'modelo' ? 'Escríbelo tal cual (ej. DS-2CD2143G2-I)' : 'Elige una opción o escríbela'}
                accessibilityLabel={f.etiquetas[c]}
                value={partes[c]}
                editable={!noAplica}
                autoCapitalize={c === 'modelo' ? 'characters' : 'sentences'}
                autoCorrect={false}
                onChangeText={(t) => poner(c, t)}
                style={noAplica ? estilos.deshabilitado : undefined}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila} keyboardShouldPersistTaps="handled">
                {lista.map((o) => (
                  <Chip key={o} texto={o} activo={partes[c] === o} onPress={() => poner(c, o)} />
                ))}
                {c !== 'tipo' ? <Chip borde texto="N/A" activo={noAplica} onPress={() => poner(c, noAplica ? '' : NA)} /> : null}
              </ScrollView>
            </View>
          );
        })}

        <View style={estilos.vista}>
          <Text style={estilos.vistaEtiqueta}>Nombre del artículo</Text>
          <Text style={estilos.vistaNombre}>{nombre ?? (anterior && sinCasillas ? editando?.nombre : 'Completa todas las casillas (o N/A)')}</Text>
        </View>

        <Etiqueta>Descripción breve (sale en la cotización y la factura)</Etiqueta>
        <Campo
          placeholder="Ej. Visión nocturna 30 m, lente 2.8 mm, IP67"
          value={descripcion}
          onChangeText={setDescripcion}
          multilinea
          style={{ minHeight: 60 }}
        />

        <Etiqueta>Costo (lo que te cuesta, sin ITBIS)</Etiqueta>
        <Campo placeholder="Ej. 500" keyboardType="decimal-pad" value={costo} onChangeText={setCosto} />

        {calculado ? (
          <>
            <Etiqueta>Margen de ganancia sobre el costo (%) y precio de venta con ITBIS {ITBIS_PCT} % incluido</Etiqueta>
            {margenes.map((m, i) => {
              const pct = aPorcentaje(m);
              return (
                <View key={i} style={estilos.nivel}>
                  <Text style={estilos.etiquetaNivel}>Precio {i + 1}</Text>
                  <Campo
                    style={estilos.margen}
                    accessibilityLabel={`Margen del precio ${i + 1}`}
                    keyboardType="decimal-pad"
                    value={m}
                    onChangeText={(t) => setMargenes((v) => v.map((x, j) => (j === i ? t : x)))}
                  />
                  <Text style={estilos.pct}>%</Text>
                  <Text style={estilos.resultado}>{pct === null ? '—' : formatear(precioDesdeCosto(costoCts as number, pct))}</Text>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Etiqueta>Precio fijo de venta (sin costo no se calculan los 3 precios)</Etiqueta>
            <Campo placeholder="Ej. 1500" keyboardType="decimal-pad" value={precio} onChangeText={setPrecio} />
          </>
        )}

        {!f.servicio ? (
          <Campo
            placeholder={editando === null ? 'Cantidad que ingresas (si ya existe, se suma a su stock)' : 'Stock en bodega (vacío = sin conteo)'}
            keyboardType="number-pad"
            value={stock}
            onChangeText={setStock}
          />
        ) : null}
        <Boton texto={editando === null ? 'Agregar al inventario' : 'Guardar cambios'} onPress={() => guardar()} />
        {editando === null ? <Boton tipo="secundario" texto="Agregar y seguir con otro similar" onPress={() => guardar(true)} /> : null}
        {editando !== null && editando.f_tipo !== null ? <Boton tipo="secundario" texto="Duplicar para otro modelo" onPress={() => duplicar(editando)} /> : null}
        {editando !== null ? <Boton tipo="secundario" texto="Cancelar edición" onPress={limpiar} /> : null}
      </Tarjeta>

      <Campo placeholder="Buscar por nombre, código o familia" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" />
      <Etiqueta>Inventario ({productos.length})</Etiqueta>
    </View>
  );

  return (
    <FlatList
      data={productos}
      keyExtractor={(p) => String(p.id)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={estilos.contenedor}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={formulario}
      ListEmptyComponent={
        <Text style={estilos.vacio}>
          {busqueda ? 'Sin resultados.' : 'El inventario está vacío. Lo que agregues aquí lo eliges con un toque en el levantamiento y la cotización.'}
        </Text>
      }
      ListFooterComponent={productos.length > 0 ? <Text style={estilos.pista}>Toca para editar. Mantén presionado para eliminar.</Text> : undefined}
      renderItem={({ item: p }) => {
        const [p1, p2, p3] = preciosArticulo(p);
        const auto = p.costo_cts > 0 && p.margen1_pct !== null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.nombre}
            accessibilityHint="Toca para editar. Mantén presionado para eliminar."
            onPress={() => editar(p)}
            onLongPress={() => confirmarEliminar(p)}>
            <Tarjeta style={{ gap: 2 }}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.detalle}>
                {p.codigo ? `${p.codigo} · ` : ''}
                {p.categoria ?? 'Sin familia'}
                {p.costo_cts ? ` · costo ${formatear(p.costo_cts)}` : ''}
                {p.f_tipo === null ? ' · nombre libre' : ''}
              </Text>
              {p.descripcion ? <Text style={estilos.detalle}>{p.descripcion}</Text> : null}
              {auto ? (
                <View style={estilos.precios}>
                  {[p1, p2, p3].map((v, i) => (
                    <Text key={i} style={estilos.precioNivel}>
                      P{i + 1} {formatear(v)}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={estilos.precioNivel}>Precio fijo {formatear(p.precio_cts)}</Text>
              )}
              {p.stock !== null ? (
                <Text style={[estilos.detalle, p.stock <= STOCK_BAJO && estilos.bajo]}>
                  {p.stock === 0 ? 'Sin stock' : `Stock: ${p.stock}`}
                  {p.stock > 0 && p.stock <= STOCK_BAJO ? ' (bajo)' : ''}
                </Text>
              ) : null}
            </Tarjeta>
          </Pressable>
        );
      }}
    />
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  encabezado: { gap: 12 },
  fila: { flexDirection: 'row', gap: 8 },
  casilla: { gap: 6 },
  deshabilitado: { opacity: 0.5 },
  aviso: { fontSize: 13, color: color.alerta },
  vista: { padding: 12, borderRadius: 12, backgroundColor: color.fondo, gap: 2 },
  vistaEtiqueta: { fontSize: 12, color: color.suave },
  vistaNombre: { fontSize: 17, fontWeight: '700', color: color.texto },
  nivel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etiquetaNivel: { width: 70, fontSize: 15, color: color.texto },
  margen: { width: 80, textAlign: 'right' },
  pct: { color: color.suave },
  resultado: { flex: 1, textAlign: 'right', fontSize: 17, fontWeight: '700', color: color.texto },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  precios: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  precioNivel: { fontSize: 15, fontWeight: '700', color: color.texto },
  bajo: { color: '#c0262d', fontWeight: '600' },
  vacio: { textAlign: 'center', color: color.suave, marginVertical: 8 },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center', marginTop: 8 },
});
