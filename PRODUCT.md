# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Base confirmada por el usuario: repositorio MiDespensa, rama main en 7c6d838.
Vite, JavaScript modular, parser XML namespace-aware y decimal.js.
Aplicación integrada con IndexedDB por entidad y modo explícito de servidor
local con Auth, Firestore y Storage emulados. La conexión cloud queda deshabilitada.

## Users

Personal interno de compras, cocina y administración que convierte los XML
mensuales recibidos del despacho en un catálogo confiable para recetas y menús.
Uso en escritorio de administración (Windows/macOS) y tablet de cocina; el
teléfono no es el contexto principal.

## Product Purpose

Una sola aplicación FORX, con MiDespensa como módulo interno de ingredientes,
categorías y precios por kilogramo, litro o pieza. Es un catálogo; no lleva
contabilidad de existencias. Cada precio explica su origen y normalización.

## Operating Context

El usuario carga los lotes mensuales directamente. Mezclan alimentos, otros
productos y servicios. Los originales son temporales: dos meses desde la carga.
Catálogo, conceptos derivados, observaciones y bitácora permanecen.
Ningún servicio ni dato de Egresos participa en la aplicación.

## Capabilities and Constraints

- Una relación producto → ingrediente requiere decisión humana o regla aprobada.
- Ingredientes y aliases tienen identidad estable; no se inventan equivalencias.
- Observaciones históricas inmutables; el precio vigente usa fecha de comprobante.
- La merma se confirma en el ingrediente y se aplica una sola vez al precio usable.
- Una receta puede guardarse, aparecer en catálogo y usarse en menús con
  ingredientes todavía ausentes. Conserva sus nombres y muestra los faltantes.
  El costo del platillo y del menú permanece no verificable hasta vincular
  ingredientes y resolver precios y unidades. La cantidad y unidad sí se validan.
- No se migran, borran o consultan datos actuales de otros sistemas.
- Blaze está aceptado si se necesita Storage/Functions, pero alcance, presupuesto,
  facturación y despliegue requieren revisión con el usuario antes de activarse.
- Este corte integra XML, revisión, catálogo, recetas manuales/por lote, menús,
  Grill Express, costeo, compras e impresión/Excel. Guardar no implica verificar
  el costo. El servidor verifica sesiones y roles y rechaza ediciones obsoletas.
- IA, recursos cloud y eliminación programada de XML en Storage no están
  habilitados; requieren un corte posterior y, donde corresponda, presupuesto.
- El flujo aprobado de Generar receta se prueba con simulador explícito: ejemplos
  fijos, propuesta, revisión humana y borrador; no interpreta restricciones ni
  consume OpenAI. Precios y vínculos siguen pendientes de MiDespensa.

## Brand Commitments

FORX es la aplicación; MiDespensa es su módulo integrado. Idioma español,
mensajes concretos, distinción visible entre pendiente, validado y conflicto.
Se conserva el sistema visual azul noche de MiDespensa documentado en DESIGN.md.
FORX mantiene su propio sistema heredado, documentado en docs/forx-design-continuity.md;
ambos módulos comparten datos y navegación, no una sustitución de identidad.
La confirmación del usuario exige conservar las interfaces y capacidades útiles
de MiDespensa y FORX. Se modifica el backend y se integra el producto sin tomar
la interfaz reducida del experimento anterior como referencia visual.

## Evidence on Hand

Contrato FORX_V2_CONTRATO_CONSTRUCCION.md del 1 de octubre de 2026 y decisiones
firmes del usuario en este chat, confirmadas el 2 de octubre.
Código local de MiDespensa y FORX legado. Fixtures sintéticas de CFDI; este corte
no acredita validación con un lote mensual real.

## Product Principles

1. Conservar la evidencia antes de interpretarla.
2. Hacer inspeccionable toda normalización.
3. Conservar decisiones e historia al corregir.
4. Mostrar claramente lo que impide verificar un costo.
5. Consultar ingredientes internos por ID, sin publicación entre aplicaciones.

## Accessibility & Inclusion

Controles semánticos, foco visible, estados con texto, errores comprensibles,
formularios utilizables con teclado y tablas desplazables en pantallas estrechas.
