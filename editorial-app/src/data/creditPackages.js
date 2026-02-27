/**
 * Credit Packages for One-Time Purchases
 *
 * These packages allow Free and Pro users to purchase additional exports
 * without upgrading to a full subscription.
 */

export const CREDIT_PACKAGES = [
  {
    id: 'credits_10',
    exports: 10,
    price: 4.99,
    label: '10 Exportaciones',
    description: 'Perfecto para usuarios ocasionales'
  },
  {
    id: 'credits_50',
    exports: 50,
    price: 19.99,
    label: '50 Exportaciones',
    description: 'Mejor valor, 20% de descuento',
    badge: 'Popular'
  },
  {
    id: 'credits_100',
    exports: 100,
    price: 34.99,
    label: '100 Exportaciones',
    description: 'Máximo ahorro, 30% de descuento',
    badge: 'Mejor precio'
  }
];

/**
 * Get a credit package by ID
 */
export function getCreditPackage(packageId) {
  return CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
}

/**
 * Get price per export for a package (for display)
 */
export function getPricePerExport(packageId) {
  const pkg = getCreditPackage(packageId);
  if (!pkg) return null;
  return (pkg.price / pkg.exports).toFixed(2);
}

/**
 * Get all available packages (for pricing page)
 */
export function getAvailablePackages() {
  return CREDIT_PACKAGES;
}
