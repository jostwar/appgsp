# Probar tiempo de respuesta de estado de cartera

Para ajustar timeouts hay que medir cuánto tarda el endpoint.

## 1. Probar desde tu máquina con `curl`

Sustituye `TU_BACKEND_URL` por la URL del backend (ej. `https://app.gsp.com.co` o `http://IP:4000`) y `CEDULA_PRUEBA` por una cédula válida.

```bash
# Ver tiempo en cabecera de respuesta (X-Cartera-Time-Ms, en milisegundos)
curl -s -D - -o /dev/null "TU_BACKEND_URL/api/cxc/estado-cartera/summary?cedula=CEDULA_PRUEBA"

# Ver respuesta JSON y tiempo
curl -s -i "TU_BACKEND_URL/api/cxc/estado-cartera/summary?cedula=CEDULA_PRUEBA"
```

En la respuesta busca la cabecera **`X-Cartera-Time-Ms`**: es el tiempo total que tardó el backend en milisegundos.

Con **`time`** de bash puedes medir todo (red + backend):

```bash
time curl -s "TU_BACKEND_URL/api/cxc/estado-cartera/summary?cedula=CEDULA_PRUEBA" -o /tmp/out.json
cat /tmp/out.json
```

## 2. Ver tiempos en el servidor (PM2)

En Lightsail, mientras haces la petición desde la app o con curl:

```bash
ssh bitnami@TU_IP
pm2 logs appgsp-backend --lines 0
```

Verás líneas como:

- `[cartera/summary] ... intentando CXC sin vendedor`
- `[cartera/summary] ... CXC sin vendedor respondió en 1234ms`
- `[cartera/summary] ... resolviendo vendedor`
- `[cartera/summary] ... resolveSeller en 500ms, vendedor=XX`
- `[cartera/summary] ... CXC con vendedor respondió en 2000ms`
- `[cartera/summary] ... ok en 3500ms`

Así sabes si se va el tiempo en CXC sin vendedor, en resolver vendedor o en CXC con vendedor.

## 3. Ajustar timeout en la app

El timeout de la petición de cartera está en **`src/api/backend.js`** en `getCarteraSummary` (ahora 60 segundos). Si en los logs ves que el backend tarda más de 60s, hay que subir ese valor. Si suele tardar p. ej. 90s, pon algo mayor (ej. 120000 ms).

```js
export function getCarteraSummary({ cedula, vendedor } = {}) {
  return request('/api/cxc/estado-cartera/summary', {
    params: { cedula, vendedor },
    timeoutMs: 60000,  // subir si el backend tarda más (ej. 120000)
  });
}
```

## 4. Ejemplo completo (Lightsail)

```bash
# En tu PC: prueba al backend en Lightsail (puerto 4000 o el que uses)
curl -s -i "https://app.gsp.com.co/api/cxc/estado-cartera/summary?cedula=123456789"
# Busca en la respuesta: X-Cartera-Time-Ms: 4523

# En el servidor: ver logs en vivo
ssh bitnami@3.145.91.120 "pm2 logs appgsp-backend --lines 0"
```

Con el valor de **X-Cartera-Time-Ms** y los logs sabes si hay que aumentar el timeout de la app o optimizar el backend.
