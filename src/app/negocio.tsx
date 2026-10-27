import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text } from 'react-native';

import { Alert } from '@/alert';
import { guardarNegocio, obtenerNegocio, type Negocio } from '@/db/negocio';
import { guardarFoto, uriFoto } from '@/fotos';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

const VACIO: Negocio = { nombre: null, rnc: null, telefono: null, correo: null, direccion: null, logo_uri: null };

export default function PerfilNegocio() {
  const db = useSQLiteContext();
  const [n, setN] = useState<Negocio>(VACIO);

  useEffect(() => {
    obtenerNegocio(db).then((r) => r && setN(r));
  }, [db]);

  const poner = (campo: keyof Negocio) => (t: string) => setN((v) => ({ ...v, [campo]: t }));

  async function elegirLogo() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
    if (!r.canceled) setN((v) => ({ ...v, logo_uri: guardarFoto(r.assets[0].uri) }));
  }

  async function guardar() {
    const limpio = Object.fromEntries(
      Object.entries(n).map(([k, v]) => [k, typeof v === 'string' && v.trim() ? v.trim() : null])
    ) as unknown as Negocio;
    await guardarNegocio(db, limpio);
    Alert.alert('Guardado', 'Estos datos saldrán en el encabezado de tus PDF.');
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Perfil del negocio' }} />
      <Text style={estilos.texto}>Estos datos y el logo salen en el encabezado de cada cotización y factura en PDF.</Text>
      <Tarjeta>
        {n.logo_uri ? <Image source={{ uri: uriFoto(n.logo_uri) }} style={estilos.logo} resizeMode="contain" /> : null}
        <Boton tipo="secundario" texto={n.logo_uri ? 'Cambiar logo' : 'Elegir logo'} onPress={elegirLogo} />
      </Tarjeta>
      <Tarjeta>
        <Etiqueta>Nombre del negocio</Etiqueta>
        <Campo value={n.nombre ?? ''} onChangeText={poner('nombre')} />
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
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 14, color: color.suave },
  logo: { width: '100%', height: 100 },
});
