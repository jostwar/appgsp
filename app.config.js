const base = require('./app.json');

const PROJECT_ID = 'e45648a5-c13e-4633-a255-4d906ddb758c';

module.exports = () => {
  const isEasBuild = process.env.EAS_BUILD === 'true' || process.env.EAS_BUILD === true;
  const config = JSON.parse(JSON.stringify(base.expo));

  // projectId siempre presente para que "eas build" pueda enlazar el proyecto (lee la config sin EAS_BUILD).
  config.extra = { ...config.extra, eas: { projectId: PROJECT_ID } };
  if (!isEasBuild) {
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
