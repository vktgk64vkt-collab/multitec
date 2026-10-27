import { Alert as AlertNativo, type AlertButton, Platform } from 'react-native';

// Alert.alert de react-native no hace nada en web: en navegador usamos window.alert / window.confirm.
export const Alert = {
  alert(titulo: string, mensaje?: string, botones?: AlertButton[]) {
    if (Platform.OS !== 'web') return AlertNativo.alert(titulo, mensaje, botones);
    const texto = mensaje ? `${titulo}\n\n${mensaje}` : titulo;
    const accion = botones?.find((b) => b.style !== 'cancel');
    if (!accion) return window.alert(texto);
    if (window.confirm(texto)) accion.onPress?.();
  },
};
