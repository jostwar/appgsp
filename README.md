# GSP Pro

## Requisitos
- Node.js 20 (usa `nvm use` si tienes nvm)
- npm 10+

## Estructura
- `App.js` navegación principal (tabs + stack)
- `src/screens/` pantallas de la app
- `src/api/` clientes de API (Woo, backend, AI search)
- `src/store/` estado global (auth, carrito)
- `backend/` API Node/Express + admin portal
- `assets/` iconos, splash, favicon

## Arranque rápido (app)
1) `npm install`
2) `npm run start:clear` (Expo)

## Variables de entorno (app)
Se leen desde `.env` en la raíz del proyecto:
```
EXPO_PUBLIC_WC_URL=
EXPO_PUBLIC_WC_KEY=
EXPO_PUBLIC_WC_SECRET=
EXPO_PUBLIC_BACKEND_URL=
```

## Optimización carga de productos (WooCommerce)

La pantalla de productos hace menos peso y carga más rápido con:

- **Payload reducido:** Las peticiones a `/wp-json/wc/v3/products` usan `_fields` para pedir solo los datos necesarios (id, name, price, images, categories, etc.) y no el objeto completo.
- **Caché en app:** Productos y categorías se cachean 5 minutos en memoria; al volver a la pestaña no se repiten las mismas peticiones.
- **Carga en paralelo:** Categorías, primera página de productos y opciones de marca se piden a la vez (`Promise.all`), no en cadena.

Si sigue yendo lenta, se puede añadir un proxy en el backend (`GET /api/woo/products`) que llame a WooCommerce, cachee en servidor y devuelva los datos a la app (una sola fuente de caché para todos los usuarios).

## Backend (local)
```
cd backend
npm install
npm run start
```

## Admin portal
Ruta: `/admin/rewards`
- Roles y usuarios se gestionan en la sección **Usuarios**
- Notificaciones push y su historial en **Notificaciones**
- Ofertas, producto de la semana, GSP Care y Comercial desde el portal

## Endpoints clave (backend)
- `GET /health` salud del backend
- `GET /api/home/offers` ofertas en home
- `GET /api/home/weekly` producto de la semana
- `POST /api/cxc/points` ventas/rewards por cédula
- `GET /api/cxc/estado-cartera/summary?cedula=...` estado de cartera
- `POST /api/push/register` registro de token push
- `POST /admin/notifications/send` envío de push desde portal

## Build APK (EAS)
```
npx eas build -p android --profile apk
```

## Deploy a Google Play

1. **Sesión EAS** (solo la primera vez o si caducó):
   ```bash
   npx eas login
   ```
   Si el proyecto no está vinculado: `npx eas init` y elige la org/cuenta.

2. **Generar AAB para producción** (versión se auto-incrementa con el perfil `production`):
   ```bash
   npx eas build -p android --profile production
   ```
   El build corre en los servidores de Expo. Al terminar, el AAB queda en el dashboard y te da un enlace para descargar.

3. **Subir a Play Console**:
   - **Opción A:** Desde la web de EAS, en el build completado, usa **Submit to Google Play** (requiere tener configurado el servicio de cuentas de Play en EAS).
   - **Opción B:** Descarga el AAB desde [expo.dev](https://expo.dev) → tu proyecto → Builds, y súbelo manualmente en [Play Console](https://play.google.com/console) → Tu app → Producción (o una pista de pruebas) → Crear nueva versión → Subir el AAB.

4. En Play Console, rellena “Novedades de esta versión” y envía a revisión. Textos sugeridos en `docs/GOOGLE-PLAY-FICHA.md`.

## Deploy backend a Lightsail

**Commit + deploy en un solo paso (recomendado):**

```bash
# Configura una vez (o usa .deploy.env con DEPLOY_HOST=... y opcionalmente DEPLOY_PATH=...)
export DEPLOY_HOST=bitnami@TU_IP_LIGHTSAIL
export DEPLOY_PATH=/home/bitnami/appgsp

./scripts/commit-and-deploy.sh "mensaje de commit"
```

El script hace `git add`, `git commit` y ejecuta el deploy a Lightsail (pull, npm install, pm2 restart).

**Solo deploy (sin commit):**

Tras `git push origin main`, en tu máquina (con acceso SSH al instance):

```bash
export DEPLOY_HOST=bitnami@TU_IP_LIGHTSAIL
export DEPLOY_PATH=/home/bitnami/appgsp   # ruta donde está el repo en el servidor
./scripts/deploy-lightsail.sh
```

En el servidor (SSH), para actualizar a mano:
```bash
cd /home/bitnami/appgsp
git pull origin main
cd backend && npm install --omit=dev
pm2 restart appgsp-backend
```

El script hace `git pull`, `npm install` en `backend/` y reinicia el proceso (pm2 o node).

## Notas
- Si el proyecto está en OneDrive, marca la carpeta como
  "Always Keep on This Device" para evitar errores `ETIMEDOUT`.
- Para ver cambios en Expo Go, reinicia con `npx expo start -c`.

