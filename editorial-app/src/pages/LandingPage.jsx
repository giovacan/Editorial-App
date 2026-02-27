import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LandingPage() {
  const navigate = useNavigate();
  const { user, signIn, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to books
  if (user) {
    return <Navigate to="/books" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/books');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInGoogle();
      navigate('/books');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* LEFT PANEL - HERO */}
      <div style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.heroIcon}>📖</div>
          <h1 style={styles.heroTitle}>Editorial App</h1>
          <p style={styles.heroTagline}>Tu editor de libros profesional para KDP y más</p>

          <div style={styles.features}>
            <div style={styles.feature}>✓ Paginación automática</div>
            <div style={styles.feature}>✓ Formatos A5, Letter, KDP</div>
            <div style={styles.feature}>✓ Exportación PDF y ePub</div>
          </div>

          <div style={styles.ctaButtons}>
            <Link to="/register" style={styles.btnPrimary}>
              Probar gratis →
            </Link>
            <Link to="/pricing" style={styles.btnSecondary}>
              Ver precios
            </Link>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - AUTH FORM */}
      <div style={styles.auth}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>Inicia sesión</h2>

          {error && <div style={styles.error}>{error}</div>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label htmlFor="email" style={styles.label}>Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="password" style={styles.label}>Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div style={styles.divider}>O</div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              ...styles.googleButton,
              opacity: loading ? 0.6 : 1,
            }}
          >
            🔐 Entrar con Google
          </button>

          <p style={styles.footer}>
            ¿No tienes cuenta?{' '}
            <Link to="/register" style={styles.link}>
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    minHeight: '100vh',
    margin: 0,
    padding: 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  hero: {
    background: 'linear-gradient(135deg, #1a2e5c 0%, #2563eb 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 40px',
    color: 'white',
  },
  heroContent: {
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
  },
  heroIcon: {
    fontSize: '64px',
    marginBottom: '10px',
  },
  heroTitle: {
    fontSize: '48px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
    color: 'white',
  },
  heroTagline: {
    fontSize: '18px',
    margin: '0',
    color: 'rgba(255,255,255,0.9)',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  feature: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.95)',
  },
  ctaButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  btnPrimary: {
    padding: '14px 28px',
    background: 'white',
    color: '#1a2e5c',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.3s',
    display: 'block',
  },
  btnSecondary: {
    padding: '12px 24px',
    background: 'transparent',
    color: 'white',
    border: '2px solid rgba(255,255,255,0.5)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    textDecoration: 'none',
    cursor: 'pointer',
    textAlign: 'center',
    display: 'block',
  },
  auth: {
    background: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 40px',
  },
  authCard: {
    width: '100%',
    maxWidth: '380px',
  },
  authTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: '0 0 30px 0',
    textAlign: 'center',
  },
  error: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  form: {
    marginBottom: '20px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  button: {
    width: '100%',
    padding: '12px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  divider: {
    textAlign: 'center',
    margin: '20px 0',
    color: '#9ca3af',
    fontSize: '12px',
  },
  googleButton: {
    width: '100%',
    padding: '12px',
    background: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  footer: {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: '14px',
    color: '#6b7280',
    margin: '20px 0 0 0',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
};
