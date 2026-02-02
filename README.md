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
- `POST /api/cxc/points` ventas/cashback por cédula
- `GET /api/cxc/estado-cartera/summary?cedula=...` estado de cartera
- `POST /api/push/register` registro de token push
- `POST /admin/notifications/send` envío de push desde portal

## Build APK (EAS)
```
npx eas build -p android --profile apk
```

## Notas
- Si el proyecto está en OneDrive, marca la carpeta como
  "Always Keep on This Device" para evitar errores `ETIMEDOUT`.
- Para ver cambios en Expo Go, reinicia con `npx expo start -c`.

