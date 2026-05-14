import type { CapacitorConfig } from '@capacitor/cli';

// Set CAP_ENV=production (or run `npm run build` then `npx cap sync` with this env var)
// before building for the App Store / Play Store. In production mode the app loads
// the bundled `dist/` build instead of the live Lovable sandbox preview.
const isProd = process.env.CAP_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'app.lovable.566ed77a8f3b4d238d6465f69e1108c8',
  appName: 'Podiverzum',
  webDir: 'dist',
  ...(isProd
    ? {}
    : {
        server: {
          url: 'https://566ed77a-8f3b-4d23-8d64-65f69e1108c8.lovableproject.com?forceHideBadge=true',
          cleartext: true,
        },
      }),
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
  },
  android: {
    backgroundColor: '#ffffff',
  },
};

export default config;
