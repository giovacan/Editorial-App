export function TrustSignals() {
  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <div style={styles.item}>
          <div style={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div style={styles.content}>
            <strong style={styles.title}>Compra 100% segura</strong>
            <span style={styles.subtitle}>Tu pago está protegido</span>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.item}>
          <div style={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
          <div style={styles.content}>
            <strong style={styles.title}>Envío instantáneo</strong>
            <span style={styles.subtitle}>Recibe tu libro en minutos</span>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.item}>
          <div style={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <div style={styles.content}>
            <strong style={styles.title}>Todos los métodos de pago</strong>
            <span style={styles.subtitle}>Visa, Mastercard, PayPal</span>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.item}>
          <div style={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div style={styles.content}>
            <strong style={styles.title}>Datos protegidos</strong>
            <span style={styles.subtitle}>Encriptación SSL</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #f0f0f0',
    borderBottom: '1px solid #f0f0f0',
    padding: '20px 40px',
  },
  row: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
    flexWrap: 'wrap',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  icon: {
    fontSize: '28px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: '12px',
    color: '#6b7280',
  },
  divider: {
    width: '1px',
    height: '40px',
    backgroundColor: '#e5e7eb',
  },
};

export default TrustSignals;
