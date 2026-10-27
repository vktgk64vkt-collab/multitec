import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Alert } from '@/alert';
import {
  actualizarProducto,
  crearProducto,
  listarCatalogo,
  obtenerProducto,
  sumarStock,
  type DatosProducto,
  type Producto,
} from '@/db/catalogo';
import { aCentavos, formatear, ITBIS_PCT, MARGENES_BASE, precioDesdeCosto } from '@/dinero';
import {
  armarNombre,
  atributosDe,
  CASILLAS,
  FAMILIAS,
  guardarAtributos,
  leerAtributos,
  NA,
  NOMBRES_FAMILIAS,
  PARTES_VACIAS,
  sugerenciasEspecificacion,
  type Casilla,
  type Partes,
} from '@/nomenclatura';
import { normalizar, separarApodos } from '@/pedido';
import { color } from '@/tema';
import { Boton, Campo, Chip, Desplegable, Etiqueta, Tarjeta, PROPS_TECLADO } from '@/ui';

const BASE = MARGENES_BASE.map(String);
const esNA = (t: string) => t.trim().toUpperCase() === NA;
// las casillas que se eligen de una lista, en orden; el modelo se escribe
const ELEGIBLES = CASILLAS.filter((c) => c !== 'modelo');

/** "17,5" -> 17.5. null si no es un porcentaje válido (0 a 1000). */
function aPorcentaje(t: string): number | null {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

/** Crear o editar un artículo del inventario: una sola tarjeta, con cada característica en su barra desplegable. */
export default function Articulo() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [editando, setEditando] = useState<Producto | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [familia, setFamilia] = useState(NOMBRES_FAMILIAS[0]);
  const [partes, setPartes] = useState<Partes>(PARTES_VACIAS);
  const [costo, setCosto] = useState('');
  const [margenes, setMargenes] = useState<string[]>(BASE);
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [apodos, setApodos] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({}); // características del tipo elegido (PoE, discos...)

  const f = FAMILIAS[familia];
  const defs = atributosDe(partes.tipo); // solo las características del equipo elegido
  const nombre = armarNombre(partes);
  const costoCts = costo.trim() === '' ? 0 : aCentavos(costo);
  const calculado = costoCts !== null && costoCts > 0;
  // artículo anterior sin nomenclatura: si no se llena ninguna casilla se conserva su nombre libre
  const anterior = editando !== null && editando.f_tipo === null;
  const sinCasillas = CASILLAS.every((c) => partes[c].trim() === '');

  const rellenar = useCallback((p: Producto) => {
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
    setApodos(p.apodos ?? '');
    setExtras(leerAtributos(p.atributos));
  }, []);

  useEffect(() => {
    if (!id) return;
    obtenerProducto(db, Number(id)).then((p) => {
      if (!p) return;
      setEditando(p);
      rellenar(p);
      setStock(p.stock === null ? '' : String(p.stock));
    });
  }, [db, id, rellenar]);

  function alternar(clave: string) {
    setAbierto((a) => (a === clave ? null : clave));
  }

  function elegirFamilia(nombreFamilia: string) {
    setFamilia(nombreFamilia);
    setPartes(PARTES_VACIAS);
    setAbierto('tipo');
  }

  /** Pone el valor y abre la siguiente característica sin responder, para ir de una en una. */
  function elegir(c: Casilla, valor: string) {
    const nuevas = { ...partes, [c]: valor };
    setPartes(nuevas);
    const sigue = ELEGIBLES.find((x) => nuevas[x].trim() === '');
    setAbierto(sigue ?? null);
  }

  /** Copia el artículo como uno nuevo (para otro modelo): todo igual menos el modelo y el stock. */
  function duplicar(p: Producto) {
    setEditando(null);
    rellenar(p);
    setPartes((x) => ({ ...x, modelo: '' }));
    setStock('');
    setApodos('');
    setAbierto(null);
  }

  /** Deja el formulario listo para otro artículo parecido: misma familia, características y márgenes. */
  function seguirConSimilar() {
    setPartes((p) => ({ ...p, modelo: '' }));
    setCosto('');
    setPrecio('');
    setStock('');
    setDescripcion('');
    setApodos('');
    setAbierto(null);
  }

  async function guardar(seguir = false) {
    const conservar = anterior && sinCasillas;
    if (!conservar) {
      if (nombre === null) {
        const faltan = CASILLAS.filter((c) => partes[c].trim() === '').map((c) => f.etiquetas[c]);
        setAbierto(ELEGIBLES.find((c) => partes[c].trim() === '') ?? null);
        return Alert.alert(
          faltan.length ? 'Faltan características' : 'Tipo inválido',
          faltan.length ? `Elige o marca "No aplica" en: ${faltan.join(', ')}.` : 'El tipo no puede ser "No aplica".'
        );
      }
      const repetido = (await listarCatalogo(db)).find((x) => x.id !== editando?.id && x.nombre.trim().toLowerCase() === nombre.toLowerCase());
      if (repetido) {
        // equipo repetido: la cantidad se suma al existente (los servicios no se suman, solo se avisa)
        if (editando === null && !f.servicio && repetido.tipo === 'equipo') {
          const cant = Number(stock);
          if (stock.trim() === '' || !Number.isInteger(cant) || cant < 1) {
            setAbierto('precios');
            return Alert.alert('Ya existe', `${repetido.nombre} (${repetido.codigo}) ya está en el inventario. Escribe la cantidad que ingresas en "Precios y stock" y se suma a su stock.`);
          }
          await sumarStock(db, repetido.id, cant);
          Alert.alert('Cantidad sumada', `${repetido.nombre}\n${repetido.codigo}: +${cant}. Stock total: ${(repetido.stock ?? 0) + cant}.`);
          if (seguir) return seguirConSimilar();
          return router.back();
        }
        return Alert.alert('Ya existe', `Ese artículo ya está en el inventario:\n${repetido.nombre} (${repetido.codigo})`);
      }
    }
    const misApodos = separarApodos(apodos);
    if (misApodos.length) {
      const otros = await listarCatalogo(db);
      for (const a of misApodos) {
        const dueno = otros.find((x) => x.id !== editando?.id && separarApodos(x.apodos).some((y) => normalizar(y) === normalizar(a)));
        if (dueno) return Alert.alert('Apodo repetido', `"${a}" ya es apodo de:
${dueno.nombre} (${dueno.codigo})
Un apodo debe llevar a un solo artículo.`);
      }
    }
    if (costoCts === null) {
      setAbierto('precios');
      return Alert.alert('Costo inválido', 'Escribe un número, o deja el costo vacío y escribe un precio fijo.');
    }
    const n = stock.trim() === '' || f.servicio ? null : Number(stock);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      setAbierto('precios');
      return Alert.alert('Stock inválido', 'El stock es un número entero, 0 o mayor. Déjalo vacío si no llevas conteo.');
    }

    let precios: Pick<DatosProducto, 'precio_cts' | 'costo_cts' | 'margen1_pct' | 'margen2_pct' | 'margen3_pct'>;
    if (calculado) {
      const m = margenes.map(aPorcentaje);
      if (m.some((x) => x === null)) {
        setAbierto('precios');
        return Alert.alert('Margen inválido', 'Escribe los 3 márgenes como porcentaje, por ejemplo 15.');
      }
      precios = { precio_cts: precioDesdeCosto(costoCts, m[0] as number), costo_cts: costoCts, margen1_pct: m[0], margen2_pct: m[1], margen3_pct: m[2] };
    } else {
      const cts = aCentavos(precio);
      if (cts === null) {
        setAbierto('precios');
        return Alert.alert('Falta el precio', 'Abre "Precios y stock": escribe el costo, o un precio fijo de venta.');
      }
      precios = { precio_cts: cts, costo_cts: 0, margen1_pct: null, margen2_pct: null, margen3_pct: null };
    }

    const datos: DatosProducto = conservar
      ? { ...(editando as Producto), ...precios, stock: n, descripcion: descripcion.trim() || null, apodos: misApodos.join(', ') || null }
      : {
          nombre: nombre as string,
          tipo: f.servicio ? 'servicio' : 'equipo',
          categoria: familia,
          stock: n,
          descripcion: descripcion.trim() || null,
          apodos: misApodos.join(', ') || null,
          atributos: guardarAtributos(partes.tipo, extras),
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
    else router.back();
  }

  function opciones(c: Casilla): string[] {
    if (c === 'tipo') return f.tipos;
    if (c === 'tecnologia') return f.tecnologias;
    if (c === 'forma') return f.formas;
    if (c === 'especificacion') return sugerenciasEspecificacion(f, partes.tipo.trim());
    if (c === 'marca') return f.marcas;
    return [];
  }

  const mostrar = (valor: string) => (valor.trim() === '' ? 'Elegir' : esNA(valor) ? 'No aplica' : valor);

  const resumenPrecios = calculado
    ? `Costo ${formatear(costoCts as number)} · P1 ${margenes[0] && aPorcentaje(margenes[0]) !== null ? formatear(precioDesdeCosto(costoCts as number, aPorcentaje(margenes[0]) as number)) : '—'}`
    : aCentavos(precio) !== null && precio.trim() !== ''
      ? `Precio fijo ${formatear(aCentavos(precio) as number)}`
      : 'Falta el precio';

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editando ? 'Editar artículo' : 'Nuevo artículo' }} />

      <View style={estilos.vista}>
        <Text style={estilos.vistaEtiqueta}>{editando?.codigo ? `Artículo ${editando.codigo}` : 'Así se llamará'}</Text>
        <Text style={[estilos.vistaNombre, !nombre && !(anterior && sinCasillas) && { color: color.suave, fontWeight: '500' }]}>
          {nombre ?? (anterior && sinCasillas ? editando?.nombre : 'Elige las características')}
        </Text>
        {anterior ? <Text style={estilos.aviso}>Tiene nombre libre. Elige las características para estandarizarlo, o déjalas para conservarlo.</Text> : null}
      </View>

      <Tarjeta style={{ gap: 0, paddingVertical: 4 }}>
        <Desplegable etiqueta="Familia" valor={familia} abierto={abierto === 'familia'} onAlternar={() => alternar('familia')}>
          <View style={estilos.opciones}>
            {NOMBRES_FAMILIAS.map((n) => (
              <Chip key={n} texto={n} activo={n === familia} onPress={() => elegirFamilia(n)} />
            ))}
          </View>
        </Desplegable>

        {ELEGIBLES.map((c) => {
          const lista = opciones(c);
          const noAplica = esNA(partes[c]);
          const propio = !noAplica && partes[c].trim() !== '' && !lista.includes(partes[c]);
          return (
            <Desplegable
              key={c}
              etiqueta={f.etiquetas[c]}
              valor={mostrar(partes[c])}
              vacio={partes[c].trim() === ''}
              abierto={abierto === c}
              onAlternar={() => alternar(c)}>
              <View style={estilos.opciones}>
                {lista.map((o) => (
                  <Chip key={o} texto={o} activo={partes[c] === o} onPress={() => elegir(c, o)} />
                ))}
                {c !== 'tipo' ? <Chip borde texto="No aplica" activo={noAplica} onPress={() => elegir(c, NA)} /> : null}
              </View>
              <Campo
                placeholder="Otro: escríbelo"
                accessibilityLabel={`${f.etiquetas[c]}, otro valor`}
                value={propio ? partes[c] : ''}
                autoCorrect={false}
                onChangeText={(t) => setPartes((p) => ({ ...p, [c]: t }))}
                onSubmitEditing={() => elegir(c, partes[c])}
                returnKeyType="done"
              />
            </Desplegable>
          );
        })}

        <View style={estilos.filaModelo}>
          <Text style={estilos.etiquetaModelo}>{f.etiquetas.modelo}</Text>
          <TextInput
            style={estilos.modelo}
            accessibilityLabel={f.etiquetas.modelo}
            placeholder="Ej. DS-2CD2143G2-I"
            placeholderTextColor={color.suave}
            value={esNA(partes.modelo) ? '' : partes.modelo}
            editable={!esNA(partes.modelo)}
            autoCapitalize="characters"
            autoCorrect={false}
            onFocus={() => setAbierto(null)}
            onChangeText={(t) => setPartes((p) => ({ ...p, modelo: t }))}
          />
          <Chip borde texto="N/A" activo={esNA(partes.modelo)} onPress={() => setPartes((p) => ({ ...p, modelo: esNA(p.modelo) ? '' : NA }))} />
        </View>
        {defs.length > 0 ? (
          <>
            <Text style={estilos.subtitulo}>Características del {partes.tipo.trim()}</Text>
            {defs.map((d) => {
              const valor = extras[d.clave] ?? '';
              const propio = valor !== '' && !d.opciones.includes(valor);
              const clave = `x-${d.clave}`;
              return (
                <Desplegable key={d.clave} etiqueta={d.etiqueta} valor={valor || 'Sin especificar'} vacio={!valor} abierto={abierto === clave} onAlternar={() => alternar(clave)}>
                  <View style={estilos.opciones}>
                    {d.opciones.map((o) => (
                      <Chip
                        key={o}
                        texto={o}
                        activo={valor === o}
                        onPress={() => {
                          setExtras((e) => ({ ...e, [d.clave]: valor === o ? '' : o }));
                          setAbierto(null);
                        }}
                      />
                    ))}
                  </View>
                  <Campo
                    placeholder="Otro: escríbelo"
                    accessibilityLabel={`${d.etiqueta}, otro valor`}
                    value={propio ? valor : ''}
                    autoCorrect={false}
                    onChangeText={(t) => setExtras((e) => ({ ...e, [d.clave]: t }))}
                  />
                </Desplegable>
              );
            })}
          </>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Descripción (sale en la cotización y la factura)</Etiqueta>
        <Campo
          placeholder="Ej. Visión nocturna 30 m, lente 2.8 mm, IP67"
          value={descripcion}
          onChangeText={setDescripcion}
          multilinea
          style={{ minHeight: 70 }}
        />
        <Etiqueta>Apodos (para encontrarlo al dictar; separa con comas)</Etiqueta>
        <Campo placeholder="Ej. gabinete 4u pequeño, rack chico" value={apodos} onChangeText={setApodos} autoCorrect={false} />
      </Tarjeta>

      <Tarjeta style={{ gap: 0, paddingVertical: 4 }}>
        <Desplegable
          etiqueta="Precios y stock"
          valor={resumenPrecios}
          vacio={resumenPrecios === 'Falta el precio'}
          abierto={abierto === 'precios'}
          onAlternar={() => alternar('precios')}>
          <Etiqueta>Costo (lo que te cuesta, sin ITBIS)</Etiqueta>
          <Campo placeholder="Ej. 500" keyboardType="decimal-pad" value={costo} onChangeText={setCosto} />
          {calculado ? (
            <>
              <Etiqueta>Margen sobre el costo (%) y precio de venta con ITBIS {ITBIS_PCT} % incluido</Etiqueta>
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
            <>
              <Etiqueta>{editando ? 'Stock en bodega (vacío = sin conteo)' : 'Cantidad que ingresas (si ya existe, se suma a su stock)'}</Etiqueta>
              <Campo keyboardType="number-pad" value={stock} onChangeText={setStock} placeholder="Ej. 10" />
            </>
          ) : null}
        </Desplegable>
      </Tarjeta>

      <Boton texto={editando ? 'Guardar cambios' : 'Agregar al inventario'} onPress={() => guardar()} />
      {!editando ? <Boton tipo="secundario" texto="Agregar y seguir con otro similar" onPress={() => guardar(true)} /> : null}
      {editando && editando.f_tipo !== null ? <Boton tipo="secundario" texto="Duplicar para otro modelo" onPress={() => duplicar(editando)} /> : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  vista: { padding: 14, borderRadius: 16, backgroundColor: color.tarjeta, gap: 4 },
  vistaEtiqueta: { fontSize: 12, color: color.suave },
  vistaNombre: { fontSize: 20, fontWeight: '700', color: color.texto },
  aviso: { fontSize: 13, color: color.alerta },
  subtitulo: { fontSize: 13, fontWeight: '700', color: color.primario, marginTop: 12 },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filaModelo: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  etiquetaModelo: { width: 118, fontSize: 14, color: color.suave },
  modelo: { flex: 1, fontSize: 16, fontWeight: '600', color: color.texto, textAlign: 'right', minHeight: 44 },
  nivel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etiquetaNivel: { width: 70, fontSize: 15, color: color.texto },
  margen: { width: 80, textAlign: 'right' },
  pct: { color: color.suave },
  resultado: { flex: 1, textAlign: 'right', fontSize: 17, fontWeight: '700', color: color.texto },
});
