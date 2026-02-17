const base = require('./app.json');

const PROJECT_ID = 'e45648a5-c13e-4633-a255-4d906ddb758c';

module.exports = () => {
  const isEasBuild = process.env.EAS_BUILD === 'true' || process.env.EAS_BUILD === true;
  const config = JSON.parse(JSON.stringify(base.expo));

  // En local (expo start): sin projectId ni owner para que Expo Go NO busque
  // actualizaciones EAS y cargue directo desde Metro (evita "new update available, downloading").
  if (isEasBuild) {
    config.extra = { ...config.extra, eas: { projectId: PROJECT_ID } };
  } else {
    config.extra = { ...config.extra, eas: {} };
    delete config.owner;
    // Evitar que el cliente busque/descargue OTA: no comprobar y URL que no devuelve updates.
    config.updates = {
      enabled: true,
      checkAutomatically: 'NEVER',
      url: 'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
    };
    config.runtimeVersion = { policy: 'appVersion' };
  }

  return config;
};
