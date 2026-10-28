import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { intentar } from '@/accion';
import { Alert } from '@/alert';
import { color } from '@/tema';
import { enlaceDeBusqueda, enlaceDeCoordenadas, coordenadasDeEnlace, normalizarUbicacion, textoCoordenadas } from '@/ubicacion';
import { Boton, Campo, Tarjeta, PROPS_TECLADO } from '@/ui';
import { actualizarCliente, crearCliente, obtenerCliente, type DatosCliente } from '@/db/clientes';

type Clave = keyof DatosCliente;

const CAMPOS: { campo: Clave; etiqueta: string; teclado?: 'phone-pad' | 'email-address'; multilinea?: boolean }[] = [
  { campo: 'nombre', etiqueta: 'Nombre *' },
  { campo: 'empresa', etiqueta: 'Empresa' },
  { campo: 'telefono', etiqueta: 'Teléfono', teclado: 'phone-pad' },
  { campo: 'correo', etiqueta: 'Correo', teclado: 'email-address' },
  { campo: 'direccion', etiqueta: 'Dirección', multilinea: true },
  { campo: 'id_fiscal', etiqueta: 'RNC o cédula' },
  { campo: 'notas', etiqueta: 'Notas', multilinea: true },
];

const VACIO: Record<Clave, string> = {
  nombre: '', empresa: '', telefono: '', correo: '', direccion: '', id_fiscal: '', notas: '', ubicacion_url: '',
};

export default function FormularioCliente() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const idCliente = id ? Number(id) : null;
  const [valores, setValores] = useState(VACIO);

  useEffect(() => {
    if (idCliente === null) return;
    obtenerCliente(db, idCliente).then((c) => {
      if (!c) return;
      setValores({
        nombre: c.nombre,
        empresa: c.empresa ?? '',
        telefono: c.telefono ?? '',
        correo: c.correo ?? '',
        direccion: c.direccion ?? '',
        id_fiscal: c.id_fiscal ?? '',
        notas: c.notas ?? '',
        ubicacion_url: c.ubicacion_url ?? '',
      });
    });
  }, [db, idCliente]);

  const ubicacion = valores.ubicacion_url.trim() ? normalizarUbicacion(valores.ubicacion_url) : null;
  const punto = ubicacion ? coordenadasDeEnlace(ubicacion) : null;
  const abrir = (url: string) => Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir', 'Revisa que Google Maps o Safari estén disponibles en este iPhone.'));

  /** El GPS del teléfono: lo útil cuando estás parado frente a la casa del cliente. */
  async function usarMiUbicacion() {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (!permiso.granted) return Alert.alert('Sin permiso', 'Activa la ubicación para Tekhnia en Ajustes, o pega el enlace de Google Maps.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setValores((v) => ({ ...v, ubicacion_url: enlaceDeCoordenadas({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }));
  }

  function buscarDireccion() {
    if (!valores.direccion.trim()) return Alert.alert('Falta la dirección', 'Escribe la dirección arriba y se busca en Google Maps para que elijas el punto exacto.');
    return abrir(enlaceDeBusqueda(valores.direccion));
  }

  async function guardar() {
    const nombre = valores.nombre.trim();
    if (!nombre) {
      Alert.alert('Falta el nombre', 'El nombre del cliente es obligatorio.');
      return;
    }
    const ubicacion = valores.ubicacion_url.trim() ? normalizarUbicacion(valores.ubicacion_url) : null;
    if (valores.ubicacion_url.trim() && !ubicacion) {
      Alert.alert('Ubicación no válida', 'Pega el enlace que da Google Maps al compartir el lugar (empieza con https://), o escribe las coordenadas, por ejemplo 18.4861, -69.9312.');
      return;
    }
    const datos: DatosCliente = {
      nombre,
      empresa: valores.empresa.trim() || null,
      telefono: valores.telefono.trim() || null,
      correo: valores.correo.trim() || null,
      direccion: valores.direccion.trim() || null,
      id_fiscal: valores.id_fiscal.trim() || null,
      notas: valores.notas.trim() || null,
      ubicacion_url: ubicacion,
    };
    if (idCliente === null) await crearCliente(db, datos);
    else await actualizarCliente(db, idCliente, datos);
    router.back();
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: idCliente === null ? 'Nuevo cliente' : 'Editar cliente',
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={12} style={estilos.botonGuardar} onPress={() => intentar(guardar)}>
              <Text style={estilos.guardar}>Guardar</Text>
            </Pressable>
          ),
        }}
      />
      <Tarjeta>
        {CAMPOS.filter((c) => c.campo !== 'notas').map(({ campo, etiqueta, teclado, multilinea }) => (
          <View key={campo} style={estilos.grupo}>
            <Text style={estilos.etiqueta}>{etiqueta}</Text>
            <Campo
              value={valores[campo]}
              onChangeText={(t) => setValores((v) => ({ ...v, [campo]: t }))}
              keyboardType={teclado}
              autoCapitalize={teclado === 'email-address' ? 'none' : 'sentences'}
              multilinea={multilinea}
              style={multilinea ? { minHeight: 80 } : undefined}
            />
          </View>
        ))}
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.grupo}>
          <Text style={estilos.etiqueta}>Ubicación en Google Maps</Text>
          <Campo
            value={valores.ubicacion_url}
            onChangeText={(t) => setValores((v) => ({ ...v, ubicacion_url: t }))}
            placeholder="Enlace de Google Maps o coordenadas"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {punto ? <Text style={estilos.pista}>Punto exacto: {textoCoordenadas(punto)}</Text> : null}
          {valores.ubicacion_url.trim() && !ubicacion ? <Text style={estilos.aviso}>No parece un enlace de Google Maps.</Text> : null}
        </View>
        <Boton tipo="secundario" texto="Usar mi ubicación actual" onPress={usarMiUbicacion} />
        <Boton tipo="secundario" texto="Buscar la dirección en Google Maps" onPress={buscarDireccion} />
        {ubicacion ? <Boton tipo="secundario" texto="Ver en Google Maps" onPress={() => abrir(ubicacion)} /> : null}
        <Text style={estilos.pista}>
          Para el punto exacto: en Google Maps toca el lugar, Compartir, Copiar enlace, y pégalo arriba. O párate en el sitio y usa tu ubicación actual.
        </Text>
      </Tarjeta>

      <Tarjeta>
        <View style={estilos.grupo}>
          <Text style={estilos.etiqueta}>Notas</Text>
          <Campo value={valores.notas} onChangeText={(t) => setValores((v) => ({ ...v, notas: t }))} multilinea style={{ minHeight: 80 }} />
        </View>
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  pista: { fontSize: 12, color: color.suave },
  aviso: { fontSize: 12, color: color.peligro },
  grupo: { gap: 4 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: color.suave },
  botonGuardar: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  guardar: { color: color.primario, fontSize: 17, fontWeight: '600' },
});
