import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { mensajeError } from '@/accion';
import { compartirArchivo, documentoPendiente, generarPdf, type ArchivoPdf } from '@/pdf';
import { htmlDocumento } from '@/pdfHtml';
import { color } from '@/tema';
import { Boton } from '@/ui';

/** Vista previa del documento tal como saldrá en el PDF, con su nombre de archivo, antes de compartirlo. */
export default function VistaPrevia() {
  const { bottom } = useSafeAreaInsets();
  const [documento] = useState(documentoPendiente);
  const [archivo, setArchivo] = useState<ArchivoPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<'pdf' | 'html'>('pdf');

  useEffect(() => {
    if (!documento || Platform.OS === 'web') return;
    generarPdf(documento)
      .then(setArchivo)
      .catch((e) => setError(mensajeError(e)));
  }, [documento]);

  const mensaje = !documento
    ? 'No hay ningún documento para mostrar. Vuelve y toca "Compartir PDF" otra vez.'
    : Platform.OS === 'web'
      ? 'La vista previa y el PDF solo funcionan en el iPhone.'
      : error;

  if (mensaje) {
    return (
      <View style={estilos.centro}>
        <Stack.Screen options={{ title: 'Vista previa' }} />
        <Text style={estilos.mensaje}>{mensaje}</Text>
        <Boton texto="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  if (!archivo || !documento) {
    return (
      <View style={estilos.centro}>
        <Stack.Screen options={{ title: 'Vista previa' }} />
        <ActivityIndicator color={color.primario} />
        <Text style={estilos.mensaje}>Preparando el documento…</Text>
      </View>
    );
  }

  // la carpeta del PDF: el visor solo puede leer archivos locales dentro de ella
  const carpeta = archivo.uri.slice(0, archivo.uri.lastIndexOf('/') + 1);

  return (
    <View style={estilos.pantalla}>
      <Stack.Screen options={{ title: 'Vista previa' }} />
      <View style={estilos.nombre}>
        <Text style={estilos.etiqueta}>Se guardará y compartirá como</Text>
        <Text style={estilos.archivo} selectable>
          {archivo.nombre}
        </Text>
      </View>

      <WebView
        style={estilos.visor}
        originWhitelist={['*']}
        allowFileAccess
        allowingReadAccessToURL={carpeta}
        source={modo === 'pdf' ? { uri: archivo.uri } : { html: htmlDocumento(documento) }}
        // si el visor no puede abrir el PDF, se muestra el mismo documento como página para que siempre haya vista previa
        onError={() => setModo('html')}
        onHttpError={() => setModo('html')}
        startInLoadingState
        renderLoading={() => (
          <View style={estilos.centro}>
            <ActivityIndicator color={color.primario} />
          </View>
        )}
        accessibilityLabel="Vista previa del documento"
      />

      <View style={[estilos.barra, { paddingBottom: bottom + 12 }]}>
        <Boton texto="Compartir PDF" onPress={() => compartirArchivo(archivo)} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: color.fondo },
  mensaje: { fontSize: 15, color: color.suave, textAlign: 'center' },
  nombre: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  etiqueta: { fontSize: 12, color: color.suave },
  archivo: { fontSize: 14, fontWeight: '600', color: color.texto },
  visor: { flex: 1, backgroundColor: '#ffffff' },
  barra: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: color.tarjeta, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borde },
});
