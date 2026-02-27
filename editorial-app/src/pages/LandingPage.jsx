import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

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

  // Show landing page (don't wait for auth loading in mock mode)

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
    <div className="landing-page">
      {/* LEFT PANEL - HERO */}
      <div className="landing-hero">
        <div className="landing-hero-content">
          <div className="hero-header">
            <div className="hero-icon">📖</div>
            <h1 className="hero-title">Editorial App</h1>
            <p className="hero-tagline">Tu editor de libros profesional para KDP y más</p>
          </div>

          <div className="hero-features">
            <div className="feature">
              <span className="feature-check">✓</span>
              <span>Paginación automática</span>
            </div>
            <div className="feature">
              <span className="feature-check">✓</span>
              <span>Formatos A5, Letter, KDP</span>
            </div>
            <div className="feature">
              <span className="feature-check">✓</span>
              <span>Exportación PDF y ePub</span>
            </div>
          </div>

          <div className="hero-cta">
            <Link to="/register" className="btn-primary">
              Probar gratis →
            </Link>
            <Link to="/pricing" className="btn-secondary">
              Ver precios
            </Link>
          </div>

          {/* MOCKUP DEL EDITOR */}
          <div className="editor-mockup">
            <div className="mockup-page">
              <div className="mockup-header">
                <div className="mockup-title">Capítulo 1: El Comienzo</div>
                <div className="mockup-author">Por Tu Nombre</div>
              </div>
              <div className="mockup-columns">
                <div className="mockup-column">
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line short"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line short"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                </div>
                <div className="mockup-column">
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line short"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line short"></div>
                  <div className="mockup-line"></div>
                  <div className="mockup-line"></div>
                </div>
              </div>
              <div className="mockup-footer">Página 1</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - AUTH FORM */}
      <div className="landing-auth">
        <div className="auth-card">
          <div className="auth-header">
            <h2 className="auth-title">Inicia sesión</h2>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-submit"
              style={{
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="form-divider">
            <span>O</span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="btn-google"
            style={{
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            🔐 Entrar con Google
          </button>

          <p className="auth-footer">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="auth-link">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
