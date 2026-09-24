import type { Product } from './types'

// URLs de imagen: placeholders estables (picsum con seed por slug/índice).
// Al conectar el CMS real, basta sustituir `images` por las URLs definitivas.
const img = (slug: string, i: number) =>
  `https://picsum.photos/seed/${slug}-${i}/900/1200`

interface ProductSeed {
  name: string
  slug: string
  description: string
  priceCents: number
  compareAtPriceCents?: number
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
  { name: 'Aurora Frame', slug: 'aurora-frame', description: 'Montura redonda de acetato hueso con puente keyhole y varillas grabadas.', priceCents: 28000, compareAtPriceCents: 34000, category: 'eyewear', collection: 'atelier', colors: ['Beige', 'Marrón'], materials: ['Acetato'], stock: 14, featured: true, bestseller: true },
  { name: 'Élan Frame', slug: 'elan-frame', description: 'Montura mariposa oversize en acetato negro pulido a mano.', priceCents: 31000, category: 'eyewear', collection: 'nocturne', colors: ['Negro'], materials: ['Acetato'], stock: 8, featured: true, isNew: true },
  { name: 'Noa Frame', slug: 'noa-frame', description: 'Montura rectangular fina en metal dorado con lentilles demo.', priceCents: 26500, category: 'eyewear', collection: 'lumiere', colors: ['Dorado'], materials: ['Metal'], stock: 21, bestseller: true },
  { name: 'Siena Frame', slug: 'siena-frame', description: 'Montura cuadrada en acetato color miel con remaches decorativos.', priceCents: 29500, category: 'eyewear', collection: 'atelier', colors: ['Marrón'], materials: ['Acetato'], stock: 0 },
  { name: 'Atelier Frame', slug: 'atelier-frame', description: 'Montura panthos clásica en acetato cristal ahumado.', priceCents: 34000, category: 'eyewear', collection: 'atelier', colors: ['Marrón', 'Negro'], materials: ['Acetato'], stock: 11, featured: true },
  { name: 'Lumière Frame', slug: 'lumiere-frame', description: 'Montura ovalada ultraligera en metal plateado mate.', priceCents: 25000, category: 'eyewear', collection: 'lumiere', colors: ['Plateado'], materials: ['Metal'], stock: 17, isNew: true },
  { name: 'Muse Frame', slug: 'muse-frame', description: 'Montura gato fina en acetato negro con interior dorado.', priceCents: 32000, category: 'eyewear', collection: 'nocturne', colors: ['Negro', 'Dorado'], materials: ['Acetato'], stock: 9, bestseller: true },
  { name: 'Celeste Frame', slug: 'celeste-frame', description: 'Montura redonda pequeña en acetato color arena.', priceCents: 27000, category: 'eyewear', collection: 'atelier', colors: ['Beige'], materials: ['Acetato'], stock: 13 },
  { name: 'Opale Frame', slug: 'opale-frame', description: 'Montura hexagonal en metal dorado con acetato tortoise.', priceCents: 35500, compareAtPriceCents: 42000, category: 'eyewear', collection: 'lumiere', colors: ['Dorado', 'Marrón'], materials: ['Metal', 'Acetato'], stock: 6, isNew: true },
  { name: 'Voile Frame', slug: 'voile-frame', description: 'Montura invisible con patilla metálica y lentes Blue Light.', priceCents: 23000, category: 'eyewear', collection: 'nocturne', colors: ['Plateado', 'Negro'], materials: ['Metal'], stock: 19 },
  // ─── Bags ───
  { name: 'Bourse Bag', slug: 'bourse-bag', description: 'Bolso bomboné en cuero de cordero con cierre de drawnstring dorado.', priceCents: 89000, category: 'bags', collection: 'lumiere', colors: ['Beige', 'Negro'], materials: ['Cuero'], stock: 5, featured: true, bestseller: true },
  { name: 'Aria Tote', slug: 'aria-tote', description: 'Shopper estructurada en cuero de curtido vegetal.', priceCents: 115000, category: 'bags', collection: 'atelier', colors: ['Marrón'], materials: ['Cuero'], stock: 7, featured: true },
  { name: 'Nocturne Clutch', slug: 'nocturne-clutch', description: 'Pochette de mano en satén negro con cadena fina.', priceCents: 64000, category: 'bags', collection: 'nocturne', colors: ['Negro'], materials: ['Tela'], stock: 10, isNew: true },
  { name: 'Sillon Shoulder', slug: 'sillon-shoulder', description: 'Bolso de hombro acolchado en nappa suave.', priceCents: 98000, category: 'bags', collection: 'nocturne', colors: ['Negro', 'Beige'], materials: ['Cuero'], stock: 4, bestseller: true },
  { name: 'Ondine Mini', slug: 'ondine-mini', description: 'Mini bolso con solapa ondulada y herrajes plateados.', priceCents: 72000, compareAtPriceCents: 85000, category: 'bags', collection: 'lumiere', colors: ['Plateado'], materials: ['Cuero'], stock: 8 },
  { name: 'Terre Bucket', slug: 'terre-bucket', description: 'Bolso cubo en cuero serraje color arcilla con cordón de cierre.', priceCents: 79000, category: 'bags', collection: 'atelier', colors: ['Marrón', 'Beige'], materials: ['Cuero'], stock: 6 },
  { name: 'Lueur Crossbody', slug: 'lueur-crossbody', description: 'Bandolera compacta en charol dorado espejo.', priceCents: 86000, category: 'bags', collection: 'lumiere', colors: ['Dorado'], materials: ['Cuero'], stock: 3, isNew: true },
  // ─── Shoes ───
  { name: 'Ballerine Utile', slug: 'ballerine-utile', description: 'Bailarinas de puntera cuadrada en nappa con cinta de lazo.', priceCents: 52000, category: 'shoes', collection: 'atelier', colors: ['Beige', 'Negro'], materials: ['Cuero'], stock: 12, bestseller: true },
  { name: 'Mule Solene', slug: 'mule-solene', description: 'Mules de tacón 55mm en piel espejo dorada.', priceCents: 59000, category: 'shoes', collection: 'lumiere', colors: ['Dorado'], materials: ['Cuero'], stock: 7, featured: true, isNew: true },
  { name: 'Botte Ravine', slug: 'botte-ravine', description: 'Botines de caña alta en cuero pull-up marrón.', priceCents: 78000, category: 'shoes', collection: 'nocturne', colors: ['Marrón', 'Negro'], materials: ['Cuero'], stock: 5 },
  { name: 'Sandalia Onde', slug: 'sandalia-onde', description: 'Sandalias de tiras onduladas en charol negro.', priceCents: 46000, compareAtPriceCents: 54000, category: 'shoes', collection: 'nocturne', colors: ['Negro'], materials: ['Cuero'], stock: 9 },
  { name: 'Derby Lucerne', slug: 'derby-lucerne', description: 'Derbies de cordones en piel pulida tono chocolate.', priceCents: 64000, category: 'shoes', collection: 'atelier', colors: ['Marrón'], materials: ['Cuero'], stock: 8 },
  { name: 'Escarpin Gala', slug: 'escarpin-gala', description: 'Escarpines de tacón fino 85mm en satén negro.', priceCents: 69000, category: 'shoes', collection: 'nocturne', colors: ['Negro'], materials: ['Tela'], stock: 0 },
  // ─── Accessories ───
  { name: 'Foulard Jardin', slug: 'foulard-jardin', description: 'Foulard cuadrado de seda twill con estampado floral dibujado a mano.', priceCents: 32000, category: 'accessories', collection: 'atelier', colors: ['Beige', 'Marrón'], materials: ['Tela'], stock: 22, featured: true, bestseller: true },
  { name: 'Ceinture Lien', slug: 'ceinture-lien', description: 'Cinturón fino de cuero trenzado con hebilla ovalada dorada.', priceCents: 28000, category: 'accessories', collection: 'lumiere', colors: ['Marrón', 'Dorado'], materials: ['Cuero', 'Metal'], stock: 15 },
  { name: 'Lunettes Cord', slug: 'lunettes-cord', description: 'Cordón para gafas de cuentas doradas y cristal facetado.', priceCents: 15000, category: 'accessories', collection: 'lumiere', colors: ['Dorado'], materials: ['Metal'], stock: 30, isNew: true },
  { name: 'Bonnet Neige', slug: 'bonnet-neige', description: 'Gorro de lana merino con punto perlado y etiqueta bordada.', priceCents: 19000, category: 'accessories', collection: 'nocturne', colors: ['Negro', 'Plateado'], materials: ['Tela'], stock: 18 },
  { name: 'Pochette Voyage', slug: 'pochette-voyage', description: 'Neceser de viaje en loneta reciclada con cremallera metálica.', priceCents: 24000, compareAtPriceCents: 29000, category: 'accessories', collection: 'atelier', colors: ['Beige'], materials: ['Tela'], stock: 12 },
]

export const products: Product[] = seeds.map((s, i) => ({
  featured: false,
  bestseller: false,
  isNew: false,
  ...s,
  id: `p-${String(i + 1).padStart(2, '0')}`,
  images: [img(s.slug, 1), img(s.slug, 2), img(s.slug, 3)],
}))
