export function MiniCart({ items, onCheckout, onContinueShopping, onRemoveItem }) {
  const total = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>🛒</span>
        <p style={styles.emptyText}>Tu carrito está vacío</p>
        <button onClick={onContinueShopping} style={styles.continueBtn}>
          Continuar comprando
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>🛒 Tu Carrito</h3>
        <span style={styles.itemCount}>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </div>

      <div style={styles.items}>
        {items.map((item, index) => (
          <div key={item.id || index} style={styles.item}>
            <img 
              src={item.cover} 
              alt={item.title} 
              style={styles.itemImage}
              onError={(e) => e.target.style.display = 'none'}
            />
            <div style={styles.itemInfo}>
              <span style={styles.itemTitle}>{item.title}</span>
              <span style={styles.itemAuthor}>{item.author}</span>
              <span style={styles.itemPrice}>${item.price?.toFixed(2)}</span>
            </div>
            <button 
              style={styles.removeBtn}
              onClick={() => onRemoveItem?.(item.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <div style={styles.total}>
          <span>Total:</span>
          <span style={styles.totalPrice}>${total.toFixed(2)}</span>
        </div>
        <button style={styles.checkoutBtn} onClick={onCheckout}>
          Finalizar compra
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: '100%',
    right: 0,
    width: '360px',
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    zIndex: 1000,
    border: '1px solid #f0f0f0',
    overflow: 'hidden',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0 0 20px 0',
  },
  continueBtn: {
    padding: '12px 24px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #f0f0f0',
  },
  title: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0,
  },
  itemCount: {
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: '500',
  },
  items: {
    maxHeight: '300px',
    overflow: 'auto',
    padding: '12px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '10px',
    marginBottom: '8px',
    backgroundColor: '#f9fafb',
  },
  itemImage: {
    width: '50px',
    height: '70px',
    objectFit: 'cover',
    borderRadius: '6px',
  },
  itemInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1e293b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '180px',
  },
  itemAuthor: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  itemPrice: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#059669',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px',
    fontSize: '12px',
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #f0f0f0',
    backgroundColor: '#f9fafb',
  },
  total: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#4b5563',
  },
  totalPrice: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#1e293b',
  },
  checkoutBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};

export default MiniCart;
