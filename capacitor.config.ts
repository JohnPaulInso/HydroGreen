import type { CapacitorConfig } from '@capacitor/cli';

// (2026-07-13) Set appId to com.hydrotrack.app; prev: com.hydrotrack.manager
const config: CapacitorConfig = {
  appId: 'com.hydrotrack.app',
  // (2026-07-13) Set appName to HydroGreen; prev: HydroTrack
  appName: 'HydroGreen',
  webDir: 'www',
  // (2026-07-13) Add FirebaseAuthentication plugin for native Google sign-in; prev: none
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com']
    }
  }
};

export default config;
