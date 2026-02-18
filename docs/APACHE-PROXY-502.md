# 502 Proxy Error – Apache delante del backend Node

Cuando ves **502 Proxy Error** y *"Error reading from remote server"*, Apache (proxy inverso) está cerrando la conexión antes de que el backend Node responda. Suele ser por **timeout del proxy**.

**Automático:** al hacer deploy se ejecuta `scripts/setup-apache-proxy-timeout.sh` en el servidor. Si sigue el 502, hazlo **a mano** en el servidor (pasos abajo).

## 0. En el servidor – script automático (rewards.gsp.com.co)

Los archivos que hacen proxy a `:4000` son estos tres. El script del repo los parchea todos:

- `/opt/bitnami/apache2/conf/vhosts/rewards.gsp.com.co.conf`
- `/opt/bitnami/apache2/conf/bitnami/bitnami.conf`
- `/opt/bitnami/apache2/conf/bitnami/bitnami-ssl.conf`

Ejecuta en el servidor (desde la raíz del proyecto):

```bash
cd ~/appgsp
sudo bash scripts/setup-apache-proxy-timeout.sh
sudo /opt/bitnami/ctlscript.sh restart apache
```

## 0b. Manual (si no tienes el script)

Edita los tres archivos de arriba y **justo encima** de la línea que dice `ProxyPass / http://127.0.0.1:4000/` añade:

```
  TimeOut 120
  ProxyTimeout 120
```

Luego reinicia Apache:

```bash
sudo /opt/bitnami/ctlscript.sh restart apache
```

## 1. Aumentar el timeout del proxy en Apache

El backend puede tardar más de 60 s (p. ej. llamadas a CXC). Apache por defecto suele tener 60 s. Hay que subirlo.

### Si usas `mod_proxy` (ProxyPass)

En el virtualhost o en el bloque donde defines el proxy (p. ej. `/etc/apache2/sites-available/` o en Bitnami `/opt/bitnami/apache2/conf/`):

```apache
# Timeout del proxy (segundos). Debe ser mayor que el tiempo máximo del backend (p. ej. 120 o 180)
ProxyTimeout 120

# Ejemplo de bloque completo
<Location /api>
  ProxyPass http://127.0.0.1:4000
  ProxyPassReverse http://127.0.0.1:4000
  ProxyTimeout 120
</Location>
```

O a nivel global en `httpd.conf`:

```apache
ProxyTimeout 120
```

Reiniciar Apache después de cambiar la config:

```bash
# Bitnami
sudo /opt/bitnami/ctlscript.sh restart apache

# O
sudo systemctl restart apache2
```

## 2. Comprobar que el backend responde

En el servidor (por SSH):

```bash
# ¿Está escuchando el puerto?
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health

# Probar el endpoint de cartera directo (sin Apache)
curl -s "http://127.0.0.1:4000/api/cxc/estado-cartera/summary?cedula=123456789" | head -c 200
```

Si por `127.0.0.1:4000` responde bien pero por el dominio da 502, el problema es el proxy (timeout o config).

## 3. Resumen de timeouts

| Capa        | Dónde                    | Valor recomendado |
|------------|---------------------------|-------------------|
| Cliente CXC (backend → CXC) | `backend/src/cxcClient.js` / `CXC_TIMEOUT_MS` | 60000 ms (60 s) o más |
| App → Backend              | `src/api/backend.js` getCarteraSummary | 60000 ms (60 s) |
| **Apache → Backend**       | **ProxyTimeout** en Apache | **120** s o más |

El proxy debe esperar más que el backend (p. ej. backend hasta 60 s → ProxyTimeout 120).
