/**
 * Enlace de WhatsApp. wa.me pide el código de país: un teléfono dominicano de 10 dígitos
 * (809, 829, 849) sin el 1 delante no abre el chat. Devuelve null si no hay dígitos.
 */
export function urlWhatsApp(telefono: string | null | undefined, texto?: string): string | null {
  let n = (telefono ?? '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 10) n = `1${n}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
