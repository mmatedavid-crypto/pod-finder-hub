import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.566ed77a8f3b4d238d6465f69e1108c8',
  appName: 'Podiverzum',
  webDir: 'dist',
  server: {
    // Hot-reload from the Lovable sandbox while developing.
    // Remove this `url` (or comment it out) before submitting to the App Store / Play Store
    // so the app loads the bundled `dist/` build instead of the live preview.
    url: 'https://566ed77a-8f3b-4d23-8d64-65f69e1108c8.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
  },
  android: {
    backgroundColor: '#ffffff',
  },
};

export default config;
