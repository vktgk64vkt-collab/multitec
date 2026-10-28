import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';

import { intentar } from '@/accion';
import { Alert } from '@/alert';
import { leerClave, preguntarAClaude } from '@/claude';
import { datosParaPreguntar } from '@/db/negocioIA';
import { color } from '@/tema';
import { Aparece, Boton, Campo, Chip, Etiqueta, Tarjeta, PROPS_TECLADO } from '@/ui';
import { useVoz } from '@/voz';

const EJEMPLOS = ['¿Cuánto me deben en total?', '¿Qué facturas están vencidas?', '¿Cuánto facturé este mes?', '¿Qué cotizaciones llevan más de una semana sin respuesta?'];

/** Pregúntale a Claude sobre tu negocio: contesta con tus facturas, cotizaciones y proyectos reales. */
export default function Preguntar() {
  const db = useSQLiteContext();
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [pensando, setPensando] = useState(false);

  async function preguntar(texto: string) {
    const limpia = texto.trim();
    if (!limpia) return Alert.alert('Falta la pregunta', 'Escribe o dicta lo que quieres saber.');
    if (!(await leerClave())) return Alert.alert('Falta la clave de Claude', 'Agrégala en Más, Asistente Claude.');
    setRespuesta(null);
    setPensando(true);
    try {
      setRespuesta(await preguntarAClaude(limpia, await datosParaPreguntar(db)));
    } finally {
      setPensando(false);
    }
  }

  const { escuchando, aviso, iniciar, detener } = useVoz(setPregunta, (dictado) => intentar(() => preguntar(dictado)));

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Pregúntale a Claude' }} />
      <Tarjeta>
        <Etiqueta>Tu pregunta</Etiqueta>
        <Campo placeholder="Ej. ¿Cuánto me deben?" value={pregunta} onChangeText={setPregunta} multilinea />
        <Boton icono={escuchando ? 'stop.fill' : 'mic'} tipo={escuchando ? 'peligro' : 'secundario'} texto={escuchando ? 'Te escucho… toca para terminar' : 'Preguntar hablando'} onPress={() => (escuchando ? detener() : iniciar(pregunta, []))} />
        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
        <Boton icono="sparkles" texto="Preguntar" onPress={() => preguntar(pregunta)} />
      </Tarjeta>

      {pensando ? <ActivityIndicator color={color.primario} /> : null}
      {respuesta ? (
        <Aparece>
          <Tarjeta>
            <Etiqueta>Claude responde</Etiqueta>
            <Text style={estilos.respuesta} selectable>
              {respuesta}
            </Text>
          </Tarjeta>
        </Aparece>
      ) : null}

      <Tarjeta>
        <Etiqueta>Prueba con</Etiqueta>
        {EJEMPLOS.map((e) => (
          <Chip
            key={e}
            borde
            texto={e}
            onPress={() => {
              setPregunta(e);
              return preguntar(e);
            }}
          />
        ))}
      </Tarjeta>

      <Text style={estilos.nota}>
        Al preguntar se envían a Claude tus facturas, cotizaciones y proyectos (clientes y montos) con tu clave de API. Nada se modifica: solo contesta.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  respuesta: { fontSize: 16, color: color.texto, lineHeight: 23 },
  aviso: { fontSize: 13, color: color.alerta },
  nota: { fontSize: 12, color: color.suave, textAlign: 'center' },
});
