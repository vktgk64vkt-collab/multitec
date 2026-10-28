import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import { numerosEnDigitos } from './pedido';
import { ESPERA_ARRANQUE_MS, ESPERA_INICIAL_MS, mensajeVoz, reintentable, SILENCIO_MS } from './vozTextos';

type Fase = 'libre' | 'iniciando' | 'escuchando' | 'cerrando';

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Dictado por voz. Un toque y habla; cuando dejas de hablar un momento se detiene solo y entrega el texto.
 *
 * Por qué es así: el reconocimiento "continuo" de iOS no se detiene al callar (sigue escuchando hasta que lo cortes),
 * así que aquí se corta tras unos segundos sin palabras nuevas. También evita lo que hacía fallar a ratos: dos
 * arranques seguidos, el final de una sesión anterior llegando cuando ya empezó otra, y errores sin explicación.
 *
 * `alActualizar` recibe el texto mientras hablas; `alTerminar`, el texto completo cuando se corta el dictado.
 */
export function useVoz(alActualizar: (texto: string) => void, alTerminar: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const fase = useRef<Fase>('libre');
  const base = useRef(''); // lo escrito antes de hablar: la voz se agrega a continuación
  const ultimo = useRef(''); // último texto reconocido, ya con números en dígitos
  const idioma = useRef('es-DO');
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descartar = useRef(false); // esta sesión terminó mal: no se entrega lo que haya
  const reintentos = useRef(0);
  const palabras = useRef<string[]>([]);
  const actualizar = useRef(alActualizar);
  const terminar = useRef(alTerminar);
  useEffect(() => {
    actualizar.current = alActualizar;
    terminar.current = alTerminar;
  });

  const pararReloj = useCallback(() => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  }, []);
  const cortarEn = useCallback(
    (ms: number) => {
      pararReloj();
      reloj.current = setTimeout(() => {
        if (fase.current === 'escuchando') {
          fase.current = 'cerrando';
          ExpoSpeechRecognitionModule.stop();
        }
      }, ms);
    },
    [pararReloj]
  );

  const iniciar = useCallback(
    async (previo: string, claves: string[] = []) => {
      if (fase.current !== 'libre') return; // otro toque mientras arranca o se cierra: se ignora
      fase.current = 'iniciando';
      palabras.current = claves;
      setAviso(null);
      try {
        const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permiso.granted) {
          fase.current = 'libre';
          setAviso(mensajeVoz('not-allowed'));
          return;
        }
        // si algo de una sesión anterior sigue vivo, se cierra y se le da un momento antes de empezar
        if ((await ExpoSpeechRecognitionModule.getStateAsync()) !== 'inactive') {
          ExpoSpeechRecognitionModule.abort();
          await pausa(500);
        }
        base.current = previo.trim() ? `${previo.trim()} ` : '';
        ultimo.current = previo;
        descartar.current = false;
        ExpoSpeechRecognitionModule.start({
          lang: idioma.current,
          interimResults: true,
          continuous: true,
          addsPunctuation: true,
          contextualStrings: palabras.current,
        });
        // si el sistema nunca confirma que empezó, el botón no se queda trabado
        pararReloj();
        reloj.current = setTimeout(() => {
          if (fase.current === 'iniciando') {
            fase.current = 'libre';
            setAviso('No pude activar el micrófono. Inténtalo de nuevo.');
          }
        }, ESPERA_ARRANQUE_MS);
      } catch (e) {
        fase.current = 'libre';
        setAviso(mensajeVoz('desconocido', e instanceof Error ? e.message : undefined));
      }
    },
    [pararReloj]
  );

  const detener = useCallback(() => {
    if (fase.current !== 'escuchando') return;
    fase.current = 'cerrando';
    pararReloj();
    ExpoSpeechRecognitionModule.stop();
  }, [pararReloj]);

  // al salir de la pantalla se corta el micrófono y no se entrega nada
  useEffect(
    () => () => {
      descartar.current = true;
      pararReloj();
      ExpoSpeechRecognitionModule.abort();
    },
    [pararReloj]
  );

  useSpeechRecognitionEvent('start', () => {
    fase.current = 'escuchando';
    reintentos.current = 0;
    setEscuchando(true);
    setAviso(null);
    cortarEn(ESPERA_INICIAL_MS); // si no se dice nada, se corta
  });

  useSpeechRecognitionEvent('result', (e) => {
    const dicho = e.results[0]?.transcript ?? '';
    ultimo.current = numerosEnDigitos(`${base.current}${dicho}`);
    actualizar.current(ultimo.current);
    if (dicho.trim() && fase.current === 'escuchando') cortarEn(SILENCIO_MS); // cada palabra nueva reinicia la cuenta
  });

  useSpeechRecognitionEvent('end', () => {
    // el final de una sesión anterior puede llegar cuando ya está arrancando la nueva: no es de esta
    if (fase.current === 'iniciando') return;
    pararReloj();
    const eraNuestra = fase.current === 'escuchando' || fase.current === 'cerrando';
    fase.current = 'libre';
    setEscuchando(false);
    if (eraNuestra && !descartar.current && ultimo.current.trim()) terminar.current(ultimo.current);
    else if (eraNuestra && !descartar.current && !ultimo.current.trim()) setAviso(mensajeVoz('no-speech'));
  });

  useSpeechRecognitionEvent('error', (e) => {
    pararReloj();
    descartar.current = true;
    const estaba = fase.current;
    fase.current = 'libre';
    setEscuchando(false);
    if (e.error === 'aborted') return;
    if (e.error === 'language-not-supported' && idioma.current === 'es-DO') {
      idioma.current = 'es-US'; // el español dominicano no está disponible en este iPhone: se usa el de EE. UU.
      void iniciar(base.current, palabras.current);
      return;
    }
    if (reintentable(e.error) && reintentos.current < 1 && estaba !== 'libre') {
      reintentos.current += 1;
      void pausa(700).then(() => iniciar(base.current, palabras.current));
      return;
    }
    setAviso(mensajeVoz(e.error, e.message));
  });

  return { escuchando, aviso, iniciar, detener, limpiarAviso: () => setAviso(null) };
}
