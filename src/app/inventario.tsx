import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { actualizarProducto, crearProducto, eliminarProducto, listarCatalogo, type DatosProducto, type Producto } from '@/db/catalogo';
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
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

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
  }

  function elegirFamilia(nombreFamilia: string) {
    setFamilia(nombreFamilia);
    setPartes(PARTES_VACIAS);
  }

  function poner(c: Casilla, valor: string) {
    setPartes((p) => ({ ...p, [c]: valor }));
  }

  function editar(p: Producto) {
    setEditando(p);
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
    setStock(p.stock === null ? '' : String(p.stock));
  }

  async function guardar() {
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
      if (repetido) return Alert.alert('Ya existe', `Ese artículo ya está en el inventario:\n${repetido.nombre}`);
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
      ? { ...(editando as Producto), ...precios, stock: n }
      : {
          nombre: nombre as string,
          tipo: f.servicio ? 'servicio' : 'equipo',
          categoria: familia,
          stock: n,
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
    limpiar();
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

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
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
            <Pressable key={n} style={[estilos.chip, n === familia && estilos.activa]} onPress={() => elegirFamilia(n)}>
              <Text style={[estilos.textoChip, n === familia && estilos.textoActivo]}>{n}</Text>
            </Pressable>
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
                value={partes[c]}
                editable={!noAplica}
                autoCapitalize={c === 'modelo' ? 'characters' : 'sentences'}
                autoCorrect={false}
                onChangeText={(t) => poner(c, t)}
                style={noAplica ? estilos.deshabilitado : undefined}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.fila} keyboardShouldPersistTaps="handled">
                {lista.map((o) => (
                  <Pressable key={o} style={[estilos.chip, partes[c] === o && estilos.activa]} onPress={() => poner(c, o)}>
                    <Text style={[estilos.textoChip, partes[c] === o && estilos.textoActivo]}>{o}</Text>
                  </Pressable>
                ))}
                {c !== 'tipo' ? (
                  <Pressable style={[estilos.chip, estilos.chipNA, noAplica && estilos.activa]} onPress={() => poner(c, noAplica ? '' : NA)}>
                    <Text style={[estilos.textoChip, noAplica && estilos.textoActivo]}>N/A</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          );
        })}

        <View style={estilos.vista}>
          <Text style={estilos.vistaEtiqueta}>Nombre del artículo</Text>
          <Text style={estilos.vistaNombre}>{nombre ?? (anterior && sinCasillas ? editando?.nombre : 'Completa todas las casillas (o N/A)')}</Text>
        </View>

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
          <Campo placeholder="Stock en bodega (vacío = sin conteo)" keyboardType="number-pad" value={stock} onChangeText={setStock} />
        ) : null}
        <Boton texto={editando === null ? 'Agregar al inventario' : 'Guardar cambios'} onPress={guardar} />
        {editando !== null ? <Boton tipo="secundario" texto="Cancelar edición" onPress={limpiar} /> : null}
      </Tarjeta>

      <Campo placeholder="Buscar por nombre o familia" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" />

      <Etiqueta>Inventario ({productos.length})</Etiqueta>
      {productos.length === 0 && (
        <Text style={estilos.vacio}>
          {busqueda ? 'Sin resultados.' : 'El inventario está vacío. Lo que agregues aquí lo eliges con un toque en el levantamiento y la cotización.'}
        </Text>
      )}
      {productos.map((p) => {
        const [p1, p2, p3] = preciosArticulo(p);
        const auto = p.costo_cts > 0 && p.margen1_pct !== null;
        return (
          <Pressable key={p.id} onPress={() => editar(p)} onLongPress={() => confirmarEliminar(p)}>
            <Tarjeta style={{ gap: 2 }}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.detalle}>
                {p.categoria ?? 'Sin familia'}
                {p.costo_cts ? ` · costo ${formatear(p.costo_cts)}` : ''}
                {p.f_tipo === null ? ' · nombre libre' : ''}
              </Text>
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
      })}
      {productos.length > 0 && <Text style={estilos.pista}>Toca para editar. Mantén presionado para eliminar.</Text>}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', gap: 8 },
  casilla: { gap: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: color.fondo },
  chipNA: { borderWidth: 1, borderColor: color.borde },
  activa: { backgroundColor: color.primario },
  textoChip: { color: color.texto },
  textoActivo: { color: '#fff', fontWeight: '600' },
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
  pista: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
