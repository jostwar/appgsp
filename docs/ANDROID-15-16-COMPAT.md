# Compatibilidad Android 15 y 16 (recomendaciones Google Play)

Cambios aplicados según las advertencias de Play Console.

## 1. Vista edge-to-edge y APIs obsoletas (Android 15)

- **Qué pide Google:** Dejar de usar APIs o parámetros obsoletos para la vista edge-to-edge y la ventana.
- **Qué tenemos:** La app usa `edgeToEdgeEnabled: true` en `app.json` y **react-native-safe-area-context** (`SafeAreaProvider`, `useSafeAreaInsets`) en `App.js` y pantallas, que es el enfoque recomendado para insets en Android 15.
- **Si el aviso sigue:** Actualizar a la última revisión de Expo SDK 54 (o al siguiente SDK cuando lo indique Expo), ya que las correcciones de APIs nativas suelen venir en el template de Expo. Opcionalmente valorar el plugin [react-native-edge-to-edge](https://www.npmjs.com/package/react-native-edge-to-edge) si Expo no actualiza a tiempo.

## 2. Pantallas grandes, redimensionamiento y orientación (Android 16)

- **Qué pide Google:** A partir de Android 16 se ignorarán las restricciones de redimensionamiento y orientación en dispositivos de pantalla grande (plegables, tablets). Conviene quitar restricciones para evitar problemas de diseño.
- **Cambios aplicados en este proyecto:**
  - **`app.json` → `orientation`:** de `"portrait"` a `"default"`. Así la app permite rotación; en Android 16 el sistema ya no forzará retrato en tablets/plegables, y nuestra UI puede adaptarse en ambas orientaciones.
- **Recomendación:** Probar la app en un emulador o dispositivo tablet/plegable (o ventana redimensionable en Android 16) para comprobar que listas, formularios y modales se ven bien en landscape y al cambiar tamaño.

## Resumen de configuración actual

| Tema              | Configuración actual |
|-------------------|----------------------|
| Edge-to-edge      | `android.edgeToEdgeEnabled: true` + SafeAreaProvider/useSafeAreaInsets |
| Orientación       | `orientation: "default"` (permite rotación) |
| Insets            | Uso de `useSafeAreaInsets()` en navegación y pantallas |

Tras estos cambios, generar un nuevo build y volver a subir a Play Console; las advertencias deberían reducirse o desaparecer en la siguiente revisión.
