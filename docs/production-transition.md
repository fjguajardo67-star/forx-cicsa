# Reemplazo de FORX

El repositorio canónico es `fjguajardo67-star/forx-cicsa` y el acceso habitual
sigue siendo `https://menu-cicsa.cicsacomedores.com.mx`. MiDespensa administra el
banco de precios que utilizan recetas y menús dentro de la misma aplicación.
La nueva implementación no consulta Egresos ni el backend del FORX anterior.

## Procedencia

La integración procede del desarrollo local
`cc16f2c3a6997d16b77abc03290afa0b48c31fa1`. El historial del repositorio conserva
la versión anterior `a274255f92b0dbd1b0cf6923976c90e1c1cdf955` para reversión.
Los datos originales se preservan. Su cierre de acceso se realiza después de
comprobar el reemplazo en la URL habitual.

## Correcciones y límites del backend

- El parser fija el RFC receptor de CICSA y rechaza sustituirlo por parámetro.
- Las facturas no elegibles se rechazan antes de cuarentena o deduplicación.
  Solo se conserva el contador del lote y una decisión genérica; no XML, UUID,
  proveedor o conceptos nuevos de esos archivos. No se borran históricos.
- Cada operación tiene un plazo real de ejecución. Una respuesta vencida no
  promete deshacer transacciones confirmadas y mantiene ocupado el cupo hasta
  que termine el trabajo. El cliente indica actualizar antes de repetir.
- La carga inicial exige respaldo v3 con checksum, destino vacío y administrador
  Google verificado. Reanuda únicamente la misma carga y no sobrescribe una
  base activa. No restaura XML originales ni cuentas.
- El API exige Google y un rol vigente para acceder a los datos. No existe una
  sesión de demostración en producción. La ruta de salud es pública.
- Las dependencias se actualizaron sin `audit fix --force`.
- La lectura de colecciones completas requiere revisar capacidad al crecer el
  volumen. Las pruebas actuales no certifican carga masiva ni alta disponibilidad.

## Empaquetado y publicación

`Dockerfile` construye un API Node 24 con dependencias de producción y usuario sin
privilegios. La imagen no contiene archivos de entorno, respaldos ni credenciales.
La configuración no secreta se proporciona con `FORX_CONFIG_JSON` o
`FORX_CONFIG_PATH`, nunca ambos. Los permisos de las identidades administradas
se configuran fuera de la imagen.

`npm run build:production` exige Node 24 y configuración pública validada mediante
`FORX_CLIENT_CONFIG_PATH` o `FORX_PUBLIC_CONFIG`. Rechaza un destino distinto de
la URL habitual y conserva `dist/CNAME`. El navegador no recibe claves privadas.
El workflow manual `publish-pages.yml` solo admite `main`, exige CI aprobado
para el mismo commit y aceptación del backend, y publica únicamente `dist`.
El entorno de publicación se limita a `main`. Pages debe usar GitHub Actions
antes de fusionar la sustitución, conservando el despliegue previo hasta que el
nuevo artefacto esté listo. Los valores operativos del despliegue se conservan
fuera del repositorio público.

## Piloto autorizado

El piloto usa un proyecto propio, una base exclusiva y buckets privados separados
para XML, respaldos y compilación. Las identidades del API, inicializador,
compilador, respaldo, retención y programador tienen funciones separadas.
El respaldo mantiene acceso de solo lectura a la base y verifica la copia guardada.
Los XML nuevos tienen retención de dos meses. Las copias derivadas excluyen XML
y cuentas. La recuperación se ensayó en emuladores y copia local aislada; todavía
no se ha ensayado una restauración en otra base cloud.

Se autorizó máximo una instancia del API y cero instancias en reposo, alertas de
gasto y mantener desactivada la IA de pago. Las alertas no detienen los cargos.
`release:preflight -- --pilot-without-ai` exige las protecciones del destino,
Google, retención, respaldo, configuración cliente/API y Git limpio; prohíbe
habilitar IA. `--candidate` conserva los requisitos del lanzamiento completo.

Se seleccionaron catálogo, recetas y compras del respaldo aprobado, excluyendo
los menús de prueba. La carga verifica los registros completos antes de activar
la base. Los precios pendientes de revisión conservan esa condición y los costos
sin evidencia suficiente siguen mostrándose como no verificables.

## Aceptación y corte

Antes de publicar se comprueban Google, catálogo y navegación en una URL temporal,
las restricciones HTTP reales y una ejecución de respaldo y retención. Después
se comprueba el dominio habitual y se cierra de forma reversible el acceso del
backend exclusivo anterior. Se conservan datos, reglas previas e historial para
reversión. No se modifican Egresos ni recursos compartidos.

La transición solo se considera terminada al verificar el reemplazo en el dominio
habitual y el cierre de acceso del sistema anterior. El acta operativa privada
registra los resultados y las referencias de despliegue.
