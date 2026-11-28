// Push no app Android (Firebase Cloud Messaging). Fica desligado até o app ter a configuração do Firebase
// (google-services.json no build); então troca para o @capacitor/push-notifications.
export const nativePushAvailable = () => false;
export async function nativePushStatus() { return 'native'; }
export async function enableNativePush() { throw new Error('Os avisos no app Android chegam na próxima versão.'); }
