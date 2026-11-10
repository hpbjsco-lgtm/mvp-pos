import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Settings of the Android and iOS apps (Capacitor). The apps contain the built web app (`dist`) and keep
 * their data in the SQLite database of the device.
 */
const config: CapacitorConfig = {
  appId: 'com.hpbackup.mvppos',
  appName: 'MVP POS',
  webDir: 'dist',
  android: {
    // The app page is served over https://localhost but must also reach the shop server over plain http (LAN address).
    allowMixedContent: true,
  },
};

export default config;
