# Reemplazo de FORX — 29 de octubre de 2026

El repositorio canónico elegido por Francisco es `fjguajardo67-star/forx-cicsa`;
la URL sigue siendo `https://menu-cicsa.cicsacomedores.com.mx`. No se crea un
acceso paralelo definitivo. MiDespensa queda integrado y administra el banco de
precios que utilizan recetas y menús. Egresos queda fuera.

## Procedencia y preservación

La rama parte del FORX anterior `a274255f92b0dbd1b0cf6923976c90e1c1cdf955` y
reemplaza sus archivos por el desarrollo integrado
`cc16f2c3a6997d16b77abc03290afa0b48c31fa1`, anteriormente guardado localmente en
`midespensa-forx`, rama `codex/forx-v2-xml-catalog`. El historial de FORX conserva
la versión anterior; no se han modificado sus datos, reglas ni servicios.
El cambio se prepara en `codex/forx-integrated-production`, sin publicar desde esa rama.

## Correcciones de backend

- RFC receptor fijo en el parser: un parámetro no permite sustituir CICSA.
- Las facturas no elegibles se rechazan antes de cuarentena o deduplicación.
  El servidor conserva solo contador del lote y una decisión genérica; no guarda
  XML, UUID, proveedor ni conceptos nuevos de esos archivos. No borra históricos.
- Plazo real de operación de 110 segundos. Una respuesta 503 no promete deshacer
  transacciones confirmadas. El cupo de concurrencia queda ocupado hasta que el
  trabajo subyacente termine; una importación deja de iniciar el siguiente archivo
  cuando vence el plazo. El cliente debe consultar el estado antes de repetir.
- Inicialización desde respaldo v3 únicamente mediante trabajo del operador,
  con checksum, destino exacto y administrador Google comprobado. Admite reanudar
  la misma carga; una base activa o distinta no se rellena ni se sobrescribe.
- Dependencias actualizadas mediante parches compatibles, sin `audit fix --force`.

## Empaquetado y publicación

`Dockerfile` prepara el API Node 24 con dependencias de producción y usuario sin
privilegios. No copia archivos de entorno, respaldos, credenciales ni configuración
real. Montar la configuración aprobada en `/etc/forx/deployment.json`. La identidad
administrada, permisos, secreto de IA y activación de recursos se configuran fuera
de la imagen. El API y los trabajos pueden usar la misma imagen, con identidades
y comandos diferentes.

Para la interfaz, `npm run build:production` exige Node 24 y la configuración
pública de Google/API mediante `FORX_CLIENT_CONFIG_PATH` o `FORX_PUBLIC_CONFIG`.
Rechaza un entorno u origen distinto del destino aprobado y conserva `dist/CNAME`.
El workflow `publish-pages.yml` es manual, solo admite `main`, exige CI completo
aprobado para ese mismo commit y confirmación de aceptación del backend.
Publica únicamente `dist`; no publica el servidor, fuentes o configuración privada.
El entorno GitHub `production` debe tener protección de revisión y la variable
`FORX_PUBLIC_CONFIG`. Pages deberá pasar de publicación de raíz de `main` a
GitHub Actions en la ventana final; no cambiar esa configuración mientras sirve
la aplicación anterior.

## Recursos pendientes de configurar

Francisco eligió un proyecto propio para FORX v2. Se creó `forx-v2-cicsa-prod`
(nombre visible `FORX v2 CICSA`) y se registró `FORX v2 Web`, app
`1:990247980647:web:ae53c302ebe1a5fc490ec2`. Se verificó `billingEnabled=false`.
No se crearon base, buckets, API ni tareas. El staging existente
`forx-midespensa-staging` mantiene MiDespensa separado en `(default)`, región
`us-central1`; se verificó que no tiene facturación habilitada. No se utilizará
esa base ni sus usuarios para inicializar automáticamente FORX v2.

Configuración mínima propuesta, pendiente de presupuesto y aceptación cloud:

- Proyecto nuevo y base nombrada exclusiva, nunca `(default)` ni Egresos.
- Región `us-central1`, por confirmar antes de crear datos.
- API Cloud Run: mínimo cero instancias, máximo una, concurrencia cuatro,
  1 CPU, 1 GiB de memoria y plazo externo de 300 segundos; revisar por volumen.
- Dos buckets privados separados: XML con vencimiento original de dos meses,
  sin versiones/soft-delete que prolonguen ese plazo; respaldos con política
  propia que todavía debe acordarse.
- Identidades distintas para API, inicialización, retención y respaldos; permisos
  mínimos y reglas de producción cerradas al acceso directo.
- Acceso Google y administrador inicial con UID verificado. No guardar claves
  privadas en GitHub Pages ni en variables VITE.
- Tareas de respaldo y retención, alertas operativas y de gasto. Un presupuesto
  de alertas cloud no es un límite duro de facturación.

No se vincula facturación, activa Blaze ni despliegan recursos con costo por
el hecho de crear el proyecto. Falta revisar cuenta de facturación y presupuesto.
La generación real de IA sigue desactivada hasta configurar su proyecto, acceso
y límites aprobados; la imagen y los trabajos no incluyen una clave.

## Traslado y aceptación

1. Descargar un respaldo completo nuevo desde la copia en la que se continuará
   trabajando; elegir datos reales y separar registros sintéticos. Conservar
   checksum y copia privada fuera del repositorio.
2. Ensayar la carga en un destino vacío y verificar cantidades, identidades,
   vínculos y costos. `initialize-from-backup` no restaura XML ni cuentas.
   No ejecutar antes `initialize`, pues esa opción inicializa otra base distinta.
3. Comando preparado para el trabajo privado, todavía no ejecutado sobre cloud:

```text
npm run job:production -- initialize-from-backup --backup /ruta/privada/respaldo-v3.json --admin UID --confirm PROYECTO/BASE --checksum CHECKSUM
```

4. Probar Google, XML válido/ajeno, precio, receta, menú real, exportación,
   reapertura desde otro equipo, respaldo y recuperación. Ejecutar backend,
   reglas, recuperación y navegador contra el candidato; comprobar IAM y
   políticas reales de Storage además de los emuladores.
5. Conservar referencia de reversión del FORX anterior. Publicar el frontend
   aceptado y comprobar la URL habitual antes de cerrar las escrituras del anterior.
6. Inventariar y deshabilitar solamente recursos exclusivos del FORX anterior.
   Reemplazar Pages no revoca pestañas ni permisos existentes. No tocar Egresos,
   recursos compartidos o de propiedad incierta ni eliminar el CNAME del reemplazo.

No se considera terminada la transición hasta comprobar la aplicación nueva en
la URL habitual y el cierre de escrituras del sistema anterior.

## Piloto aprobado y recursos creados — 29 de octubre

Francisco autorizó vincular `Pago de Firebase` y desplegar el piloto con máximo
una instancia y cero instancias en reposo. Autorizó expresamente mantener IA de
pago desactivada y trasladar catálogo, recetas y compras excluyendo los dos menús
de prueba. El presupuesto de alertas se configuró en 180 MXN mensuales (la cuenta
factura en MXN), con umbrales 50 %, 90 % y 100 %. Las alertas no son un corte
automático de gasto. El proyecto está vinculado a esa cuenta.

Se crearon `forx-production-cicsa` en `us-central1`, con protección de borrado,
y los buckets privados `forx-v2-cicsa-prod-originals` y
`forx-v2-cicsa-prod-backups`. Se creó el registro Artifact Registry `forx` y
se inicializó Authentication. Esto no acredita todavía un API desplegado,
permisos IAM aceptados, usuarios o datos cargados ni cambio del CNAME.

El piloto sin IA se comprueba con `release:preflight -- --pilot-without-ai`.
Esa opción exige las mismas protecciones de destino, Google, retención de XML,
respaldo, configuración cliente/API y Git limpio. Prohíbe habilitar IA y etiqueta
el manifiesto como `pilotWithoutAI:true`. `--candidate` conserva el requisito de
IA aprobada para la publicación completa. Esta excepción deriva de la aprobación
específica del piloto y no cambia los requisitos del lanzamiento completo.
