export function LoadingSpinner() {
  return (
    <div style={styles.container}>
      <div style={styles.spinner}>
        <div style={styles.spinner1}></div>
        <div style={styles.spinner2}></div>
        <div style={styles.spinner3}></div>
      </div>
      <p style={styles.text}>Cargando...</p>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  spinner: {
    position: 'relative',
    width: '50px',
    height: '50px',
    marginBottom: '20px',
  },
  spinner1: {
    position: 'absolute',
    width: '50px',
    height: '50px',
    border: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin1 1s linear infinite',
  },
  spinner2: {
    position: 'absolute',
    width: '40px',
    height: '40px',
    top: '5px',
    left: '5px',
    border: '3px solid #dbeafe',
    borderRadius: '50%',
    animation: 'spin2 2s linear infinite',
  },
  spinner3: {
    position: 'absolute',
    width: '30px',
    height: '30px',
    top: '10px',
    left: '10px',
    border: '3px solid #93c5fd',
    borderRadius: '50%',
    animation: 'spin1 3s linear infinite',
  },
  text: {
    color: '#6b7280',
    fontSize: '14px',
    margin: 0,
  },
};

// Add CSS animation to document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin1 {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes spin2 {
      0% { transform: rotate(360deg); }
      100% { transform: rotate(0deg); }
    }
  `;
  document.head.appendChild(style);
}
