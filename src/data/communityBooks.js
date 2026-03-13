const COMMUNITY_BOOKS = [
  {
    id: 'community-1',
    title: 'El Arte de Escribir',
    author: 'María García',
    description: 'Guía completa para escritores noveles',
    cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&h=300&fit=crop',
    price: 9.99,
    category: 'novela',
    rating: 4.5,
    downloads: 1250,
  },
  {
    id: 'community-2',
    title: 'Misterio en la Montaña',
    author: 'Carlos Ruiz',
    description: 'Una novela de suspense ambientada en los Alpes',
    cover: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&h=300&fit=crop',
    price: 7.99,
    category: 'ensayo',
    rating: 4.2,
    downloads: 890,
  },
  {
    id: 'community-3',
    title: 'Poemas del Alba',
    author: 'Ana Martínez',
    description: 'Colección de poesía contemporánea',
    cover: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=200&h=300&fit=crop',
    price: 5.99,
    category: 'poesia',
    rating: 4.8,
    downloads: 567,
  },
  {
    id: 'community-4',
    title: 'Manual de Cocina',
    author: 'Juan Pérez',
    description: '100 recetas fáciles para el día a día',
    cover: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=200&h=300&fit=crop',
    price: 12.99,
    category: 'manual',
    rating: 4.6,
    downloads: 2100,
  },
  {
    id: 'community-5',
    title: 'Cuentos Infantiles',
    author: 'Laura López',
    description: 'Historias mágicas para dormir',
    cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=200&h=300&fit=crop',
    price: 6.99,
    category: 'infantil',
    rating: 4.9,
    downloads: 3200,
  },
  {
    id: 'community-6',
    title: 'El Viajero del Tiempo',
    author: 'Roberto Sánchez',
    description: 'Una aventura científica fascinante',
    cover: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=200&h=300&fit=crop',
    price: 8.99,
    category: 'novela',
    rating: 4.3,
    downloads: 1100,
  },
];

export const getCommunityBooks = () => COMMUNITY_BOOKS;

export const getCommunityBooksByCategory = (category) => {
  if (!category || category === 'all') return COMMUNITY_BOOKS;
  return COMMUNITY_BOOKS.filter(book => book.category === category);
};

export default COMMUNITY_BOOKS;
