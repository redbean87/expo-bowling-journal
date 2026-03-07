import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Bowling Journal',
  slug: 'expo-bowling-journal',
  scheme: 'bowlingjournal',
  version: '1.0.0',
  backgroundColor: '#F5F7FA',
  orientation: 'portrait',
  icon: './assets/icons/app-icon-1024.png',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  android: {
    package: 'com.redbean.bowlingjournal',
    backgroundColor: '#F5F7FA',
  },
  ios: {
    backgroundColor: '#F5F7FA',
  },
  web: {
    output: 'static',
    name: 'Bowling Journal',
    shortName: 'Bowling',
    lang: 'en',
    display: 'standalone',
    orientation: 'portrait',
    themeColor: '#1B6EF3',
    backgroundColor: '#F5F7FB',
    favicon: './assets/icons/favicon.png',
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '74309c94-69e7-45fd-9fc0-024287d7624a',
    },
  },
  owner: 'redbean',
});
