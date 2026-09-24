# OBJETIVO DEL PROYECTO

Quiero que construyas un e-commerce premium de moda/accesorios utilizando **TanStack Start + React + TypeScript**, tomando como **referencia visual y de experiencia de usuario** el siguiente sitio:

https://www.chloe.com/es-es/c/eyewear/optical-frames

La intención es crear una experiencia de e-commerce **muy cercana en calidad, estructura, navegación, jerarquía visual, interacción y sensación premium** a la referencia.

IMPORTANTE:

No quiero una copia literal de la marca Chloé, sus textos, logotipos, fotografías protegidas, identidad de marca ni contenido propietario.

Debes utilizar una **marca ficticia/provisional**, productos de prueba y recursos visuales propios o placeholders.

El resultado debe sentirse como un **e-commerce de lujo real y profesional**, no como una plantilla genérica.

---

# 1. ANTES DE PROGRAMAR

Primero analiza profundamente la web de referencia.

Estudia:

- Header.
- Navegación principal.
- Mega menú.
- Jerarquía de categorías.
- Menús desplegables.
- Espaciados.
- Tipografía.
- Tamaños.
- Grid de productos.
- Tarjetas.
- Filtros.
- Ordenamiento.
- Página de categoría.
- Página individual de producto.
- Carrito.
- Mini-cart.
- Login.
- Registro.
- Responsive design.
- Microinteracciones.
- Estados hover.
- Estados loading.
- Estados empty.
- Estados de error.
- Animaciones.
- Transiciones.
- Footer.
- Comportamiento en desktop/tablet/mobile.

No empieces a implementar hasta entender cómo funciona la experiencia completa.

---

# 2. TECNOLOGÍA OBLIGATORIA

Construye el proyecto utilizando:

- TanStack Start
- React
- TypeScript
- TanStack Router
- TanStack Query cuando sea útil
- Tailwind CSS
- Componentes reutilizables
- Arquitectura modular
- Datos mock/locales inicialmente
- Estado global para carrito cuando sea necesario

NO quiero una SPA improvisada con todo dentro de un único componente.

La aplicación debe tener una arquitectura preparada para posteriormente conectar:

- API real
- Base de datos
- autenticación
- pagos
- inventario
- pedidos
- CMS

---

# 3. CONSISTENCIA CON EL PROYECTO EXISTENTE

MUY IMPORTANTE:

Si este proyecto parte de una aplicación existente, **NO destruyas ni reemplaces la estructura existente sin analizarla primero**.

Primero inspecciona:

- estructura de carpetas
- rutas
- componentes
- estilos
- configuración
- dependencias
- variables de entorno
- lógica existente
- modelos de datos
- funcionalidades existentes

Debes mantener la consistencia con todo lo que ya te he solicitado anteriormente.

Si existe una funcionalidad que ya funciona:

**NO LA ELIMINES.**

Si necesitas modificarla para adaptarla al nuevo diseño:

**refactorízala manteniendo su comportamiento.**

El objetivo es evolucionar el proyecto, no empezar nuevamente desde cero.

---

# 4. IDENTIDAD VISUAL

La interfaz debe transmitir:

- lujo
- minimalismo
- elegancia
- editorial fashion
- sofisticación
- mucho espacio negativo
- composición limpia
- imágenes grandes
- tipografía refinada
- navegación discreta
- sensación premium

Evita completamente:

- dashboards genéricos
- cards excesivamente redondeadas
- gradients innecesarios
- botones gigantes
- sombras exageradas
- colores saturados
- estética SaaS
- apariencia de plantilla de Shopify genérica

La interfaz debe parecer diseñada por un equipo profesional de una marca de moda internacional.

---

# 5. HEADER

Crear un header completo y responsive.

Debe incluir:

- Logo/nombre de marca
- navegación principal
- categorías
- búsqueda
- cuenta
- carrito
- selector de región/moneda si corresponde

La navegación debe comportarse como un e-commerce premium.

Crear mega-menús cuando corresponda.

Los mega-menús deben:

- abrirse suavemente
- tener columnas
- mostrar categorías
- permitir navegación
- funcionar correctamente en desktop
- transformarse correctamente en mobile

En mobile utilizar un menú lateral/off-canvas profesional.

---

# 6. HOME

Crear una homepage premium.

Debe incluir:

### Hero

Una sección visual de alto impacto:

- imagen grande
- texto minimalista
- CTA
- composición editorial
- responsive

### Featured collections

Mostrar diferentes colecciones/productos.

### Product showcase

Grid de productos destacados.

### Editorial sections

Secciones visuales inspiradas en una revista de moda.

### Newsletter

Bloque elegante para suscripción.

### Footer

Footer completo con:

- navegación
- información
- contacto
- redes
- newsletter
- políticas
- copyright

---

# 7. CATÁLOGO

Crear una página de categoría similar a una experiencia de e-commerce de lujo.

Ejemplo:

/shop

/shop/category

/shop/category/eyewear

Debe incluir:

- título de categoría
- descripción editorial
- contador de productos
- filtros
- ordenar por
- grid responsive
- productos
- paginación o carga progresiva

Los filtros deben funcionar realmente.

Ejemplos:

### Categoría

- Gafas
- Bolsos
- Zapatos
- Accesorios

### Colección

- Colección A
- Colección B
- Colección C

### Color

- Negro
- Marrón
- Beige
- Dorado
- Plateado

### Material

- Acetato
- Metal
- Cuero
- Tela

### Precio

- menor precio
- mayor precio
- rango

---

# 8. ORDENAMIENTO

Implementar realmente:

- Recomendados
- Precio: menor a mayor
- Precio: mayor a menor
- Más vendidos
- Nuevos

No quiero botones visuales que no hagan nada.

---

# 9. PRODUCTOS DE PRUEBA

Crear un catálogo de productos mock.

Utiliza productos ficticios.

Por ejemplo:

- Aurora Frame
- Élan Frame
- Noa Frame
- Siena Frame
- Atelier Frame
- Lumière Frame
- Muse Frame
- Celeste Frame

Cada producto debe tener:

```ts
{
  id,
  name,
  slug,
  description,
  price,
  compareAtPrice,
  category,
  collection,
  colors,
  materials,
  images,
  stock,
  featured,
  bestseller,
  isNew
}
```

Crear suficientes productos para que el catálogo se sienta real.

Idealmente entre **20 y 30 productos de prueba**.

No utilizar nombres, fotografías o textos reales de Chloé.

---

# 10. PRODUCT CARD

Crear un componente reutilizable:

ProductCard

Debe mostrar:

- imagen
- segunda imagen al hover si existe
- nombre
- precio
- color
- badge opcional
- wishlist
- disponibilidad

Hover:

- transición suave
- cambio de imagen
- aparición de acciones

Mobile debe seguir siendo cómodo y limpio.

---

# 11. PRODUCT DETAIL

Crear una página completa:

`/product/:slug`

Debe incluir:

- galería de imágenes
- imagen principal grande
- thumbnails
- nombre
- precio
- descripción
- colores
- variantes
- disponibilidad
- selector de cantidad
- añadir al carrito
- wishlist
- información de envío
- información de devolución
- detalles del producto
- productos relacionados

El botón:

**AÑADIR AL CARRITO**

debe funcionar realmente.

---

# 12. CARRITO

El carrito es OBLIGATORIO y debe funcionar completamente.

Implementar:

### Mini cart

Al agregar un producto:

- abrir drawer lateral o mini-cart
- mostrar producto
- imagen
- cantidad
- precio
- subtotal

### Cart page

Ruta:

`/cart`

Debe permitir:

- aumentar cantidad
- disminuir cantidad
- eliminar producto
- visualizar subtotal
- visualizar shipping estimado
- visualizar total
- continuar comprando
- checkout

El estado del carrito debe persistir durante la navegación.

Idealmente persistir también en:

`localStorage`

para que al recargar la página los productos continúen en el carrito.

---

# 13. CHECKOUT

No necesito todavía integración real de pagos.

Pero sí quiero un checkout visual y funcional.

Crear:

- información del cliente
- dirección
- método de envío
- resumen del pedido
- subtotal
- envío
- total
- botón de confirmar pedido

Al confirmar:

crear un pedido mock y mostrar una pantalla de éxito.

Ejemplo:

"Gracias por tu compra."

Generar un número de pedido ficticio.

---

# 14. LOGIN Y CUENTA

Crear:

`/login`

`/register`

`/account`

La experiencia debe mantener exactamente la misma línea visual del e-commerce.

No crear una pantalla de login que parezca un dashboard administrativo.

Debe sentirse como parte de una marca de lujo.

---

# 15. SEARCH

Implementar búsqueda funcional.

El usuario debe poder:

- abrir búsqueda
- escribir
- buscar productos
- ver resultados
- seleccionar producto

Idealmente utilizar una experiencia de búsqueda fullscreen/overlay en desktop.

---

# 16. WISHLIST

Implementar wishlist.

El usuario debe poder:

- añadir producto
- quitar producto
- consultar wishlist

Inicialmente puede funcionar con estado local/localStorage.

---

# 17. RESPONSIVE

La web debe estar diseñada primero pensando en una experiencia premium.

Debe funcionar perfectamente en:

- Desktop
- Laptop
- Tablet
- Mobile

No quiero simplemente que el desktop "se reduzca".

El layout debe adaptarse realmente.

Especial atención a:

- header
- mega menu
- grid
- imágenes
- filtros
- carrito
- checkout
- product detail

---

# 18. ANIMACIONES

Utilizar animaciones sutiles.

Ejemplos:

- fade
- slide
- hover
- image transition
- drawer
- modal
- menu
- page transition

NO exagerar las animaciones.

La sensación debe ser:

"lujo silencioso"

y no una página llena de efectos.

---

# 19. COMPONENTES

Crear componentes reutilizables.

Por ejemplo:

```text
components/
├── layout/
│   ├── Header
│   ├── Footer
│   ├── MegaMenu
│   └── MobileMenu
│
├── product/
│   ├── ProductCard
│   ├── ProductGrid
│   ├── ProductGallery
│   ├── ProductInfo
│   └── RelatedProducts
│
├── cart/
│   ├── CartDrawer
│   ├── CartItem
│   └── CartSummary
│
├── filters/
│   ├── FilterPanel
│   ├── FilterGroup
│   └── SortSelect
│
└── ui/
    ├── Button
    ├── Modal
    ├── Drawer
    ├── Badge
    └── ...
```

Adapta esta estructura a la arquitectura real de TanStack Start.

No la copies literalmente si el proyecto tiene una estructura mejor.

---

# 20. CALIDAD DEL CÓDIGO

El código debe ser:

- TypeScript correctamente tipado
- modular
- reutilizable
- limpio
- mantenible
- escalable

Evitar:

- `any`
- componentes gigantes
- lógica duplicada
- datos hardcodeados dentro de componentes
- rutas inconsistentes
- estados innecesarios
- código muerto

---

# 21. DATOS MOCK

Crear una capa independiente para productos.

Por ejemplo:

```text
data/
products.ts
categories.ts
collections.ts
```

De esta manera posteriormente podremos sustituir:

```text
mock data
```

por:

```text
API
```

sin tener que rehacer todo el frontend.

---

# 22. ESTADOS IMPORTANTES

Todas las interfaces deben contemplar:

- loading
- empty
- error
- out of stock
- product not found
- cart empty
- search without results
- wishlist empty

No quiero solamente el "happy path".

---

# 23. SEO

Implementar correctamente:

- title
- description
- metadata
- Open Graph
- URLs amigables
- slugs

Cada producto debe tener una URL similar a:

`/product/aurora-frame`

---

# 24. PERFORMANCE

Optimizar:

- imágenes
- lazy loading
- componentes
- queries
- renderizados innecesarios
- bundle

No sacrificar la experiencia visual por performance, pero tampoco crear una página pesada innecesariamente.

---

# 25. REGLA FUNDAMENTAL

NO QUIERO UNA DEMO ESTÁTICA.

Quiero una aplicación e-commerce funcional.

Debe poder realizarse este flujo completo:

```text
HOME
 ↓
CATEGORÍA
 ↓
FILTROS
 ↓
PRODUCTO
 ↓
AÑADIR AL CARRITO
 ↓
CARRITO
 ↓
CHECKOUT
 ↓
CONFIRMAR PEDIDO
 ↓
ORDEN CREADA
```

Todo debe funcionar.

---

# 26. VALIDACIÓN FINAL

Antes de terminar debes probar:

### Navegación

- Todos los links.
- Todas las rutas.
- Header.
- Footer.
- Mega menu.
- Mobile menu.

### Productos

- Listado.
- Filtros.
- Ordenamiento.
- Búsqueda.
- Detalle.

### Carrito

- Añadir.
- Eliminar.
- Aumentar cantidad.
- Disminuir cantidad.
- Persistencia.
- Cálculos.

### Checkout

- Formulario.
- Validaciones.
- Resumen.
- Confirmación.

### Responsive

Probar como mínimo:

- 1440px
- 1280px
- 1024px
- 768px
- 390px

---

# 27. MUY IMPORTANTE: CONSISTENCIA

Durante todo el desarrollo recuerda:

**No diseñes cada página como si fuera un proyecto diferente.**

Todo debe pertenecer al mismo sistema visual.

Debe existir consistencia en:

- tipografía
- spacing
- botones
- colores
- imágenes
- grids
- headers
- footers
- modales
- drawers
- animaciones
- estados
- formularios

La web debe sentirse como **una única marca premium**.

---

# 28. RESULTADO ESPERADO

Al finalizar quiero tener un e-commerce que visualmente transmita:

> "Una marca de moda de lujo con una plataforma de comercio electrónico moderna, minimalista, editorial y extremadamente cuidada."

Debe sentirse inspirado en la experiencia de Chloé, pero ser una **implementación propia**, con:

- marca ficticia
- productos ficticios
- imágenes de prueba
- arquitectura propia
- código propio
- carrito funcional
- navegación funcional
- filtros funcionales
- búsqueda funcional
- checkout funcional
- responsive completo

NO entregues solamente una maqueta.

ENTREGA UNA EXPERIENCIA E-COMMERCE FUNCIONAL Y COHERENTE.

---

# ORDEN DE EJECUCIÓN

Trabaja en este orden:

1. Analizar proyecto existente.
2. Analizar referencia visual.
3. Definir arquitectura.
4. Definir sistema visual.
5. Crear layout global.
6. Crear Header + Mega Menu.
7. Crear Homepage.
8. Crear catálogo.
9. Crear filtros y ordenamiento.
10. Crear Product Card.
11. Crear Product Detail.
12. Crear carrito.
13. Crear checkout.
14. Crear login/register.
15. Crear wishlist.
16. Crear búsqueda.
17. Responsive.
18. Animaciones.
19. SEO.
20. Testing completo.
21. Revisar errores.
22. Pulir detalles visuales.

NO avances al siguiente bloque dejando funcionalidades rotas del bloque anterior.

Al finalizar cada etapa verifica que todo siga funcionando.

# CRITERIO FINAL

No evalúes el resultado solamente por:

"¿Funciona?"

Evalúalo también por:

"¿Parece un e-commerce premium real?"

La prioridad es:

**FUNCIONALIDAD + CONSISTENCIA + UX + DISEÑO PREMIUM + RESPONSIVE + CALIDAD DE CÓDIGO.**