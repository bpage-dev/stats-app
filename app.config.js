// Dynamic config layered on top of app.json. When APP_VARIANT=development (set by
// the EAS "development" build profile), the app gets its own id + name so the dev
// build can be installed ALONGSIDE the preview/production app on one device.
module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';
  if (!isDev) return config;

  return {
    ...config,
    name: 'Stats (Dev)',
    android: {
      ...config.android,
      package: 'com.bpage.stats.dev',
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.bpage.stats.dev',
    },
  };
};
