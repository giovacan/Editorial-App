import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getSystemConfig, updateSystemConfig, subscribeToSystemConfig } from '../../services/systemConfig';

export default function AdminConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    // Subscribe to real-time config changes
    const unsubscribe = subscribeToSystemConfig((newConfig) => {
      setConfig(newConfig);
      if (newConfig) {
        setFormData({
          stripePublishableKey: newConfig.stripePublishableKey || '',
          stripePriceIdPro: newConfig.stripePriceIdPro || '',
          stripePriceIdPremium: newConfig.stripePriceIdPremium || '',
          maintenanceMode: newConfig.maintenanceMode || false,
          registrationEnabled: newConfig.registrationEnabled !== false,
        });
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await updateSystemConfig(formData, user.uid);
      setMessage('✓ Configuración guardada exitosamente');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('✗ Error al guardar la configuración: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={styles.container}>Cargando...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Configuración del Sistema</h2>

      {message && (
        <div
          style={{
            ...styles.message,
            backgroundColor: message.startsWith('✓') ? '#dcfce7' : '#fee2e2',
            color: message.startsWith('✓') ? '#166534' : '#991b1b',
          }}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Stripe Section */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>⚡ Configuración de Stripe</h3>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="stripePublishableKey">
              Stripe Publishable Key
            </label>
            <div style={styles.passwordWrapper}>
              <input
                id="stripePublishableKey"
                type={showPasswords ? 'text' : 'password'}
                name="stripePublishableKey"
                value={formData.stripePublishableKey}
                onChange={handleInputChange}
                placeholder="pk_live_xxx o pk_test_xxx"
                style={styles.input}
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                style={styles.toggleButton}
              >
                {showPasswords ? '🙈' : '👁'}
              </button>
            </div>
            <p style={styles.hint}>
              Encontrada en Stripe Dashboard → Developers → API keys
            </p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="stripePriceIdPro">
              Stripe Price ID (Plan Pro)
            </label>
            <input
              id="stripePriceIdPro"
              type="text"
              name="stripePriceIdPro"
              value={formData.stripePriceIdPro}
              onChange={handleInputChange}
              placeholder="price_xxx"
              style={styles.input}
            />
            <p style={styles.hint}>
              Plan Pro: $9.99/mes. ID encontrado en Products → Prices
            </p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="stripePriceIdPremium">
              Stripe Price ID (Plan Premium)
            </label>
            <input
              id="stripePriceIdPremium"
              type="text"
              name="stripePriceIdPremium"
              value={formData.stripePriceIdPremium}
              onChange={handleInputChange}
              placeholder="price_xxx"
              style={styles.input}
            />
            <p style={styles.hint}>
              Plan Premium: $19.99/mes. ID encontrado en Products → Prices
            </p>
          </div>
        </section>

        {/* App Settings Section */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>🔧 Configuración de la App</h3>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="maintenanceMode"
                checked={formData.maintenanceMode}
                onChange={handleInputChange}
                style={styles.checkbox}
              />
              Modo mantenimiento
            </label>
            <p style={styles.hint}>
              Cuando está activado, muestra mensaje de mantenimiento a todos los usuarios
            </p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="registrationEnabled"
                checked={formData.registrationEnabled}
                onChange={handleInputChange}
                style={styles.checkbox}
              />
              Permitir nuevos registros
            </label>
            <p style={styles.hint}>
              Cuando está desactivado, nuevos usuarios no pueden registrarse
            </p>
          </div>
        </section>

        {/* Info Section */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>ℹ️ Información</h3>
          {config && (
            <div style={styles.infoBox}>
              <p>
                <strong>Última actualización:</strong>{' '}
                {config.updatedAt?.toDate?.()?.toLocaleString() ||
                  new Date(config.updatedAt).toLocaleString()}
              </p>
              <p>
                <strong>Actualizado por:</strong> {config.updatedBy}
              </p>
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={saving}
          style={{
            ...styles.submitButton,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar Configuración'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#1f2937',
    margin: '0 0 30px 0',
  },
  message: {
    padding: '12px 16px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    padding: '30px',
  },
  section: {
    marginBottom: '30px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
    margin: '0 0 20px 0',
    paddingBottom: '10px',
    borderBottom: '1px solid #e5e7eb',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#374151',
    gap: '8px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
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
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  toggleButton: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0',
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: '6px 0 0 0',
  },
  infoBox: {
    backgroundColor: '#f3f4f6',
    padding: '12px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#374151',
  },
  submitButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '20px',
  },
};
