import type { Product } from './types'

// URLs de imagen: placeholders estables (picsum con seed por slug/índice).
// Al conectar el CMS real, basta sustituir `images` por las URLs definitivas.
const img = (slug: string, i: number) =>
  `https://picsum.photos/seed/${slug}-${i}/900/1200`

interface ProductSeed {
  name: string
  slug: string
  description: string
  price: number
  compareAtPrice?: number
  category: Product['category']
  collection: Product['collection']
  colors: string[]
  materials: string[]
  stock: number
  featured?: boolean
  bestseller?: boolean
  isNew?: boolean
}

const seeds: ProductSeed[] = [
  // ─── Eyewear ───
  { name: 'Aurora Frame', slug: 'aurora-frame', description: 'Montura redonda de acetato hueso con puente keyhole y varillas grabadas.', price: 280, compareAtPrice: 340, category: 'eyewear', collection: 'atelier', colors: ['Beige', 'Marrón'], materials: ['Acetato'], stock: 14, featured: true, bestseller: true },
  { name: 'Élan Frame', slug: 'elan-frame', description: 'Montura mariposa oversize en acetato negro pulido a mano.', price: 310, category: 'eyewear', collection: 'nocturne', colors: ['Negro'], materials: ['Acetato'], stock: 8, featured: true, isNew: true },
  { name: 'Noa Frame', slug: 'noa-frame', description: 'Montura rectangular fina en metal dorado con lentilles demo.', price: 265, category: 'eyewear', collection: 'lumiere', colors: ['Dorado'], materials: ['Metal'], stock: 21, bestseller: true },
  { name: 'Siena Frame', slug: 'siena-frame', description: 'Montura cuadrada en acetato color miel con remaches decorativos.', price: 295, category: 'eyewear', collection: 'atelier', colors: ['Marrón'], materials: ['Acetato'], stock: 0 },
  { name: 'Atelier Frame', slug: 'atelier-frame', description: 'Montura panthos clásica en acetato cristal ahumado.', price: 340, category: 'eyewear', collection: 'atelier', colors: ['Marrón', 'Negro'], materials: ['Acetato'], stock: 11, featured: true },
  { name: 'Lumière Frame', slug: 'lumiere-frame', description: 'Montura ovalada ultraligera en metal plateado mate.', price: 250, category: 'eyewear', collection: 'lumiere', colors: ['Plateado'], materials: ['Metal'], stock: 17, isNew: true },
  { name: 'Muse Frame', slug: 'muse-frame', description: 'Montura gato fina en acetato negro con interior dorado.', price: 320, category: 'eyewear', collection: 'nocturne', colors: ['Negro', 'Dorado'], materials: ['Acetato'], stock: 9, bestseller: true },
  { name: 'Celeste Frame', slug: 'celeste-frame', description: 'Montura redonda pequeña en acetato color arena.', price: 270, category: 'eyewear', collection: 'atelier', colors: ['Beige'], materials: ['Acetato'], stock: 13 },
  { name: 'Opale Frame', slug: 'opale-frame', description: 'Montura hexagonal en metal dorado con acetato tortoise.', price: 355, compareAtPrice: 420, category: 'eyewear', collection: 'lumiere', colors: ['Dorado', 'Marrón'], materials: ['Metal', 'Acetato'], stock: 6, isNew: true },
  { name: 'Voile Frame', slug: 'voile-frame', description: 'Montura invisible con patilla metálica y lentes Blue Light.', price: 230, category: 'eyewear', collection: 'nocturne', colors: ['Plateado', 'Negro'], materials: ['Metal'], stock: 19 },
  // ─── Bags ───
  { name: 'Bourse Bag', slug: 'bourse-bag', description: 'Bolso bomboné en cuero de cordero con cierre de drawnstring dorado.', price: 890, category: 'bags', collection: 'lumiere', colors: ['Beige', 'Negro'], materials: ['Cuero'], stock: 5, featured: true, bestseller: true },
  { name: 'Aria Tote', slug: 'aria-tote', description: 'Shopper estructurada en cuero de curtido vegetal.', price: 1150, category: 'bags', collection: 'atelier', colors: ['Marrón'], materials: ['Cuero'], stock: 7, featured: true },
  { name: 'Nocturne Clutch', slug: 'nocturne-clutch', description: 'Pochette de mano en satén negro con cadena fina.', price: 640, category: 'bags', collection: 'nocturne', colors: ['Negro'], materials: ['Tela'], stock: 10, isNew: true },
  { name: 'Sillon Shoulder', slug: 'sillon-shoulder', description: 'Bolso de hombro acolchado en nappa suave.', price: 980, category: 'bags', collection: 'nocturne', colors: ['Negro', 'Beige'], materials: ['Cuero'], stock: 4, bestseller: true },
  { name: 'Ondine Mini', slug: 'ondine-mini', description: 'Mini bolso con solapa ondulada y herrajes plateados.', price: 720, compareAtPrice: 850, category: 'bags', collection: 'lumiere', colors: ['Plateado'], materials: ['Cuero'], stock: 8 },
  { name: 'Terre Bucket', slug: 'terre-bucket', description: 'Bolso cubo en cuero serraje color arcilla con cordón de cierre.', price: 790, category: 'bags', collection: 'atelier', colors: ['Marrón', 'Beige'], materials: ['Cuero'], stock: 6 },
  { name: 'Lueur Crossbody', slug: 'lueur-crossbody', description: 'Bandolera compacta en charol dorado espejo.', price: 860, category: 'bags', collection: 'lumiere', colors: ['Dorado'], materials: ['Cuero'], stock: 3, isNew: true },
  // ─── Shoes ───
  { name: 'Ballerine Utile', slug: 'ballerine-utile', description: 'Bailarinas de puntera cuadrada en nappa con cinta de lazo.', price: 520, category: 'shoes', collection: 'atelier', colors: ['Beige', 'Negro'], materials: ['Cuero'], stock: 12, bestseller: true },
  { name: 'Mule Solene', slug: 'mule-solene', description: 'Mules de tacón 55mm en piel espejo dorada.', price: 590, category: 'shoes', collection: 'lumiere', colors: ['Dorado'], materials: ['Cuero'], stock: 7, featured: true, isNew: true },
  { name: 'Botte Ravine', slug: 'botte-ravine', description: 'Botines de caña alta en cuero pull-up marrón.', price: 780, category: 'shoes', collection: 'nocturne', colors: ['Marrón', 'Negro'], materials: ['Cuero'], stock: 5 },
  { name: 'Sandalia Onde', slug: 'sandalia-onde', description: 'Sandalias de tiras onduladas en charol negro.', price: 460, compareAtPrice: 540, category: 'shoes', collection: 'nocturne', colors: ['Negro'], materials: ['Cuero'], stock: 9 },
  { name: 'Derby Lucerne', slug: 'derby-lucerne', description: 'Derbies de cordones en piel pulida tono chocolate.', price: 640, category: 'shoes', collection: 'atelier', colors: ['Marrón'], materials: ['Cuero'], stock: 8 },
  { name: 'Escarpin Gala', slug: 'escarpin-gala', description: 'Escarpines de tacón fino 85mm en satén negro.', price: 690, category: 'shoes', collection: 'nocturne', colors: ['Negro'], materials: ['Tela'], stock: 0 },
  // ─── Accessories ───
  { name: 'Foulard Jardin', slug: 'foulard-jardin', description: 'Foulard cuadrado de seda twill con estampado floral dibujado a mano.', price: 320, category: 'accessories', collection: 'atelier', colors: ['Beige', 'Marrón'], materials: ['Tela'], stock: 22, featured: true, bestseller: true },
  { name: 'Ceinture Lien', slug: 'ceinture-lien', description: 'Cinturón fino de cuero trenzado con hebilla ovalada dorada.', price: 280, category: 'accessories', collection: 'lumiere', colors: ['Marrón', 'Dorado'], materials: ['Cuero', 'Metal'], stock: 15 },
  { name: ' Lunettes Cord', slug: 'lunettes-cord', description: 'Cordón para gafas de cuentas doradas y cristal facetado.', price: 150, category: 'accessories', collection: 'lumiere', colors: ['Dorado'], materials: ['Metal'], stock: 30, isNew: true },
  { name: 'Bonnet Neige', slug: 'bonnet-neige', description: 'Gorro de lana merino con punto perlado y etiqueta bordada.', price: 190, category: 'accessories', collection: 'nocturne', colors: ['Negro', 'Plateado'], materials: ['Tela'], stock: 18 },
  { name: 'Pochette Voyage', slug: 'pochette-voyage', description: 'Neceser de viaje en loneta reciclada con cremallera metálica.', price: 240, compareAtPrice: 290, category: 'accessories', collection: 'atelier', colors: ['Beige'], materials: ['Tela'], stock: 12 },
]

export const products: Product[] = seeds.map((s, i) => ({
  featured: false,
  bestseller: false,
  isNew: false,
  ...s,
  id: `p-${String(i + 1).padStart(2, '0')}`,
  images: [img(s.slug, 1), img(s.slug, 2), img(s.slug, 3)],
}))
