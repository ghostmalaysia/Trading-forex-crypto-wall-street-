import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const request = await Notifications.requestPermissionsAsync();
  return !!request.granted;
}

export async function notifyAlert(title, body) {
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: false },
    trigger: null,
  });
  return true;
}
