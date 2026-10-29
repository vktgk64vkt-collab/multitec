import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { aplicarMargenesATodo } from '@/db/catalogo';
import { guardarMargenes, guardarNegocio, obtenerMargenes, obtenerNegocio, type Margenes, type Negocio } from '@/db/negocio';
import { aPorcentaje } from '@/dinero';
import { guardarFoto, uriFoto } from '@/fotos';
import { COLOR_BASE, COLORES_SUGERIDOS, esColorHex, paleta } from '@/marca';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta, PROPS_TECLADO } from '@/ui';

const VACIO: Negocio = { nombre: null, rnc: null, telefono: null, correo: null, direccion: null, logo_uri: null, lema: null, color: null };

/** Mi empresa: el logo, el nombre, el color y los datos que llevan todos los documentos (cotización, propuesta y factura). */
export default function MiEmpresa() {
  const db = useSQLiteContext();
  const [n, setN] = useState<Negocio>(VACIO);
  const [margenes, setMargenes] = useState<string[]>(['15', '20', '30']);

  useEffect(() => {
    obtenerNegocio(db).then((r) => r && setN(r));
    obtenerMargenes(db).then((m) => setMargenes(m.map(String)));
  }, [db]);

  const poner = (campo: keyof Negocio) => (t: string) => setN((v) => ({ ...v, [campo]: t }));
  const p = paleta(n.color);

  async function elegirLogo() {
    // sin recorte: los logos horizontales no deben cortarse en cuadrado
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
    if (!r.canceled) setN((v) => ({ ...v, logo_uri: guardarFoto(r.assets[0].uri) }));
  }

  /** Los tres márgenes válidos, o null (ya avisó al usuario). */
  function margenesValidos(): Margenes | null {
    const m = margenes.map(aPorcentaje);
    if (m.some((x) => x === null)) {
      Alert.alert('Margen inválido', 'Escribe los 3 márgenes como porcentaje, por ejemplo 15.');
      return null;
    }
    return m as Margenes;
  }

  async function guardarLosMargenes() {
    const m = margenesValidos();
    if (!m) return;
    await guardarMargenes(db, m);
    Alert.alert('Guardado', 'Los artículos nuevos nacerán con estos márgenes. Los que ya tienes no cambian.');
  }

  function aplicarATodo() {
    const m = margenesValidos();
    if (!m) return;
    Alert.alert(
      'Aplicar a todo el inventario',
      `Todos los artículos con precio calculado pasan a ${m.join(', ')} % y su precio se recalcula. Los de precio fijo no cambian ni las cotizaciones ya hechas. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: async () => {
            await guardarMargenes(db, m);
            const cambiados = await aplicarMargenesATodo(db, m);
            Alert.alert('Listo', `Se actualizaron ${cambiados} artículo${cambiados === 1 ? '' : 's'}.`);
          },
        },
      ]
    );
  }

  async function guardar() {
    if (n.color && n.color.trim() && !esColorHex(n.color)) {
      return Alert.alert('Color inválido', 'Elige uno de los colores o escribe un código como #045883.');
    }
    const limpio = Object.fromEntries(
      Object.entries(n).map(([k, v]) => [k, typeof v === 'string' && v.trim() ? v.trim() : null])
    ) as unknown as Negocio;
    await guardarNegocio(db, limpio);
    Alert.alert('Guardado', 'Tus cotizaciones, propuestas y facturas ya llevan esta identidad.');
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Mi empresa' }} />
      <Text style={estilos.texto}>Tu logo, tu color y tus datos salen en el encabezado de cada cotización, propuesta y factura en PDF.</Text>

      <Tarjeta>
        <Etiqueta>Así se verá el encabezado</Etiqueta>
        <View style={estilos.vista}>
          <View style={[estilos.vistaBarra, { backgroundColor: p.principal }]} />
          <View style={estilos.vistaCuerpo}>
            {n.logo_uri ? (
              <Image source={{ uri: uriFoto(n.logo_uri) }} style={estilos.logo} resizeMode="contain" />
            ) : (
              <Text style={[estilos.vistaNombre, { color: p.principal }]}>{n.nombre?.trim() || 'Tu empresa'}</Text>
            )}
            <Text style={[estilos.vistaTipo, { color: p.principal }]}>FACTURA</Text>
          </View>
          {n.lema?.trim() ? <Text style={[estilos.vistaLema, { color: p.claro }]}>{n.lema.trim().toUpperCase()}</Text> : null}
        </View>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Logo</Etiqueta>
        <Boton tipo="secundario" texto={n.logo_uri ? 'Cambiar logo' : 'Elegir logo de Fotos'} onPress={elegirLogo} />
        {n.logo_uri ? <Boton tipo="secundario" texto="Quitar logo" onPress={() => setN((v) => ({ ...v, logo_uri: null }))} /> : null}
        <Text style={estilos.pista}>Mejor un logo horizontal sobre fondo blanco o transparente. Sin logo se usa el nombre.</Text>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Color de tu marca</Etiqueta>
        <View style={estilos.colores}>
          {COLORES_SUGERIDOS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c}`}
              accessibilityState={{ selected: p.principal === c }}
              style={[estilos.muestra, { backgroundColor: c }, p.principal === c && estilos.muestraActiva]}
              onPress={() => setN((v) => ({ ...v, color: c }))}
            />
          ))}
        </View>
        <Campo
          placeholder={`O escribe el código (ej. ${COLOR_BASE})`}
          value={n.color ?? ''}
          onChangeText={poner('color')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Nombre de la empresa</Etiqueta>
        <Campo placeholder="Ej. Mi Empresa, S.R.L." value={n.nombre ?? ''} onChangeText={poner('nombre')} />
        <Etiqueta>Lema (pie de los documentos, opcional)</Etiqueta>
        <Campo placeholder="Ej. Servicios de calidad" value={n.lema ?? ''} onChangeText={poner('lema')} />
        <Etiqueta>RNC</Etiqueta>
        <Campo value={n.rnc ?? ''} onChangeText={poner('rnc')} keyboardType="number-pad" />
        <Etiqueta>Teléfono</Etiqueta>
        <Campo value={n.telefono ?? ''} onChangeText={poner('telefono')} keyboardType="phone-pad" />
        <Etiqueta>Correo</Etiqueta>
        <Campo value={n.correo ?? ''} onChangeText={poner('correo')} keyboardType="email-address" autoCapitalize="none" />
        <Etiqueta>Dirección</Etiqueta>
        <Campo value={n.direccion ?? ''} onChangeText={poner('direccion')} multilinea />
      </Tarjeta>
      <Boton texto="Guardar" onPress={guardar} />

      <Tarjeta>
        <Etiqueta>Márgenes de ganancia (%)</Etiqueta>
        <Text style={estilos.pista}>Sobre el costo del artículo, para los precios 1, 2 y 3. Así nacen los artículos nuevos, también los que entran por voz o por el PDF del suplidor.</Text>
        {margenes.map((m, i) => (
          <View key={i} style={estilos.margen}>
            <Text style={estilos.margenEtiqueta}>Precio {i + 1}</Text>
            <Campo
              style={estilos.margenCampo}
              accessibilityLabel={`Margen del precio ${i + 1}`}
              keyboardType="decimal-pad"
              value={m}
              onChangeText={(t) => setMargenes((v) => v.map((x, j) => (j === i ? t : x)))}
            />
            <Text style={estilos.pista}>%</Text>
          </View>
        ))}
        <Boton tipo="secundario" texto="Guardar márgenes" onPress={guardarLosMargenes} />
        <Boton tipo="secundario" texto="Aplicar a todo el inventario" onPress={aplicarATodo} />
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 14, color: color.suave },
  pista: { fontSize: 12, color: color.suave },
  logo: { height: 44, width: 180 },
  vista: { borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: color.borde, overflow: 'hidden' },
  vistaBarra: { height: 8 },
  vistaCuerpo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  vistaNombre: { fontSize: 18, fontWeight: '700' },
  vistaTipo: { fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  vistaLema: { textAlign: 'center', fontSize: 9, letterSpacing: 2, paddingBottom: 10, fontWeight: '600' },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  muestra: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  muestraActiva: { borderColor: color.texto },
  margen: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  margenEtiqueta: { width: 80, fontSize: 15, color: color.texto },
  margenCampo: { width: 90, textAlign: 'right' },
});
