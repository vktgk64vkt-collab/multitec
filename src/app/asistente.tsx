import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { borrarClave, clavePartida, guardarClave, guardarModelo, leerClave, leerModelo, probarConexion } from '@/claude';
import { MODELO_BASE, MODELOS_CLAUDE } from '@/pedido';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta, PROPS_TECLADO } from '@/ui';

/** Asistente Claude: la clave de API del usuario y el modelo con el que se entienden los pedidos dictados. */
export default function Asistente() {
  const [guardada, setGuardada] = useState<string | null>(null);
  const [nueva, setNueva] = useState('');
  const [modelo, setModelo] = useState<string>(MODELO_BASE);

  useEffect(() => {
    leerClave().then(setGuardada);
    leerModelo().then(setModelo);
  }, []);

  async function guardar() {
    const clave = nueva.trim();
    if (!clave.startsWith('sk-ant-')) {
      return Alert.alert('Clave inválida', 'La clave de API de Anthropic empieza con "sk-ant-". Cópiala completa desde console.anthropic.com.');
    }
    await guardarClave(clave);
    setGuardada(clave);
    setNueva('');
    Alert.alert('Guardada', 'La clave quedó en el llavero seguro del iPhone. Toca "Probar conexión" para confirmar que funciona.');
  }

  async function probar() {
    if (!guardada) return Alert.alert('Falta la clave', 'Pega primero tu clave de API y guárdala.');
    await probarConexion(guardada, modelo);
    Alert.alert('Todo bien', 'Claude respondió. Ya puedes dictar pedidos en el levantamiento.');
  }

  function quitar() {
    Alert.alert('Quitar la clave', 'La app volverá a entender los pedidos sin Claude (sin conexión y gratis, pero menos flexible).', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await borrarClave();
          setGuardada(null);
        },
      },
    ]);
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Asistente Claude' }} />
      <Text style={estilos.texto}>
        Dicta lo que necesitas en el levantamiento y Claude lo convierte en líneas con los nombres reales de tu inventario. Funciona con tu propia
        clave de API de Anthropic, que es aparte de tu suscripción Claude Pro.
      </Text>

      <Tarjeta>
        <Etiqueta>Cómo conseguir la clave</Etiqueta>
        <Text style={estilos.paso}>1. Entra a console.anthropic.com con tu correo.</Text>
        <Text style={estilos.paso}>2. En Billing, agrega saldo (con 5 dólares te alcanza para cientos de pedidos).</Text>
        <Text style={estilos.paso}>3. En API keys, crea una clave y cópiala. Solo se muestra una vez.</Text>
        <Boton tipo="secundario" texto="Abrir console.anthropic.com" onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} />
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Clave de API</Etiqueta>
        {guardada ? <Text style={estilos.guardada}>Guardada: {clavePartida(guardada)}</Text> : <Text style={estilos.texto}>Aún no hay clave. Sin ella se usa el entendedor local.</Text>}
        <Campo
          placeholder={guardada ? 'Pega otra para reemplazarla' : 'sk-ant-...'}
          value={nueva}
          onChangeText={setNueva}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Boton texto="Guardar clave" onPress={guardar} />
        {guardada ? <Boton tipo="secundario" texto="Probar conexión" onPress={probar} /> : null}
        {guardada ? <Boton tipo="peligro" texto="Quitar la clave" onPress={quitar} /> : null}
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Modelo</Etiqueta>
        <View style={estilos.modelos}>
          {MODELOS_CLAUDE.map((m) => (
            <Chip
              key={m.id}
              texto={m.nombre}
              activo={modelo === m.id}
              onPress={async () => {
                setModelo(m.id);
                await guardarModelo(m.id);
              }}
            />
          ))}
        </View>
        <Text style={estilos.texto}>{MODELOS_CLAUDE.find((m) => m.id === modelo)?.detalle}</Text>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Qué se envía a Claude</Etiqueta>
        <Text style={estilos.texto}>
          Solo lo que dictas y la lista de tu inventario (código, nombre, apodos y tipo). Nunca precios, costos, clientes, facturas ni fotos. La
          clave no entra en los respaldos.
        </Text>
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 14, color: color.suave },
  paso: { fontSize: 14, color: color.texto },
  guardada: { fontSize: 15, fontWeight: '600', color: color.ok },
  modelos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
