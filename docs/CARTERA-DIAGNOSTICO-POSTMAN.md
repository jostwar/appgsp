# Diagnóstico de cartera en Postman

Para ver **paso a paso** por qué no carga la cartera, usa el endpoint de diagnóstico. **Siempre responde 200** (nunca 502/500 desde el backend), así puedes ver el comportamiento aunque falle algo en el camino.

**Si ves "Cannot GET /api/cxc/estado-cartera/diagnostic"** es que el servidor tiene código antiguo. Despliega los últimos cambios y usa la URL con `summary?...&diagnostic=1` (abajo); así obtienes el mismo diagnóstico.

## Request en Postman

- **Método:** GET  
- **URL (usa esta; funciona aunque el servidor no tenga la ruta /diagnostic):**  
  `https://app.gsp.com.co/api/cxc/estado-cartera/summary?cedula=TU_CEDULA&diagnostic=1`

- **URL alternativa** (cuando el servidor tenga el código actualizado):  
  `https://app.gsp.com.co/api/cxc/estado-cartera/diagnostic?cedula=TU_CEDULA`

(Sustituye `TU_CEDULA` por una cédula de prueba, ej. `901188568`.)

**Sí, puedes probar el diagnóstico en Postman:** mismo request GET; la respuesta trae todos los pasos (incluido `cartera_lambda` si usas Lambda) y el `summary` final. Así compruebas que el Lambda + Fomplus devuelven saldos por cliente sin tocar la app.

## Qué devuelve la API

La respuesta es un JSON con:

| Campo | Descripción |
|-------|-------------|
| `request` | Lo que recibió (cedula, vendedor). |
| `steps` | Lista de pasos ejecutados: nombre, tiempo en ms, si tuvo éxito y detalle (error, recomendación). |
| `summary` | Objeto final de cartera (cupoCredito, saldoCartera, etc.) o null si no hubo datos. |
| `totalMs` | Tiempo total del request en ms. |
| `recommendation` | Texto con qué revisar según lo que falló. |

### Pasos que puedes ver en `steps`

1. **init** – Cedula normalizada y fecha. Si falla aquí, falta `cedula` en la URL.
2. **cartera_lambda** – (Si está configurado `CARTERA_LAMBDA_URL`.) Llamada al Lambda de cartera. Si `success: true` verás `requestedCedula`, `responseCustomerId`, `bodyKeys`; si falla, `error`. Si el Lambda responde bien, **no se llama a CXC** y el tiempo total es bajo (~500 ms).
3. **cxc_sin_vendedor** – Llamada a CXC sin vendedor (solo si el Lambda no devolvió datos). Si `success: false`, mira `error` y `recommendation`.
4. **cxc_post_fallback** / **cxc_post_result** – Si el GET a CXC devolvió solo `xmlns`, se intenta SOAP POST.
5. **resolve_vendedor** – Resolución del vendedor desde clientes (si aún no hay payload).
6. **cxc_con_vendedor** – Llamada a CXC con vendedor.
7. **parse_and_cupo** – Parseo del payload y búsqueda de cupo.

### Cómo interpretar

- Si **no llega respuesta** (Postman se queda cargando o 502): el problema está **antes** del backend (Apache/proxy en app.gsp.com.co, red, DNS). Revisar ProxyTimeout y que el backend esté arriba.
- Si **llega 200** con `steps`:
  - Algún paso con `success: false` → usar su `error` y `recommendation` para corregir (timeouts, CXC, clientes).
  - Todos `success: true` pero la app no muestra cartera → revisar que la app envíe `cedula` y que el timeout de la app (60 s) sea mayor que `totalMs`.

La cabecera **X-Cartera-Time-Ms** también trae el tiempo total; si es muy alto (>60 000 ms), la app puede estar cortando por timeout.
