import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getSystemConfig, updateSystemConfig } from '../../services/systemConfig';

export default function AdminPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const config = await getSystemConfig();
      if (config && config.plans) {
        setPlans(config.plans);
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = (planType, field, value) => {
    setPlans((prev) => ({
      ...prev,
      [planType]: {
        ...prev[planType],
        [field]: field === 'price' ? parseFloat(value) : value,
      },
    }));
  };

  const handleFeatureChange = (planType, featureIndex, value) => {
    setPlans((prev) => {
      const newFeatures = [...prev[planType].features];
      newFeatures[featureIndex] = value;
      return {
        ...prev,
        [planType]: {
          ...prev[planType],
          features: newFeatures,
        },
      };
    });
  };

  const handleAddFeature = (planType) => {
    setPlans((prev) => ({
      ...prev,
      [planType]: {
        ...prev[planType],
        features: [...prev[planType].features, 'Nueva feature'],
      },
    }));
  };

  const handleRemoveFeature = (planType, featureIndex) => {
    setPlans((prev) => ({
      ...prev,
      [planType]: {
        ...prev[planType],
        features: prev[planType].features.filter((_, i) => i !== featureIndex),
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await updateSystemConfig({ plans }, user.uid);
      setMessage('✓ Planes guardados exitosamente');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('✗ Error al guardar planes: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={styles.container}>Cargando planes...</div>;
  }

  if (!plans) {
    return <div style={styles.container}>Error al cargar planes</div>;
  }

  const planConfigs = [
    { key: 'free', label: 'Plan Gratuito', color: '#9ca3af' },
    { key: 'pro', label: 'Plan Pro', color: '#3b82f6' },
    { key: 'premium', label: 'Plan Premium', color: '#8b5cf6' },
  ];

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Gestión de Planes</h2>

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
        <div style={styles.plansGrid}>
          {planConfigs.map(({ key, label, color }) => (
            <div key={key} style={styles.planCard}>
              <div style={{ ...styles.planHeader, borderColor: color }}>
                <h3 style={{ ...styles.planTitle, color }}>{label}</h3>
              </div>

              <div style={styles.planBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Precio mensual ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={plans[key].price || 0}
                    onChange={(e) =>
                      handlePlanChange(key, 'price', e.target.value)
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Máximo de libros</label>
                  <input
                    type="number"
                    min="-1"
                    value={plans[key].maxBooks}
                    onChange={(e) =>
                      handlePlanChange(key, 'maxBooks', parseInt(e.target.value))
                    }
                    style={styles.input}
                  />
                  <p style={styles.hint}>(-1 = ilimitado)</p>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Máximo de exportaciones</label>
                  <input
                    type="number"
                    min="-1"
                    value={plans[key].maxExports}
                    onChange={(e) =>
                      handlePlanChange(key, 'maxExports', parseInt(e.target.value))
                    }
                    style={styles.input}
                  />
                  <p style={styles.hint}>(-1 = ilimitado)</p>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Features incluidos</label>
                  <div style={styles.featuresList}>
                    {plans[key].features.map((feature, idx) => (
                      <div key={idx} style={styles.featureItem}>
                        <input
                          type="text"
                          value={feature}
                          onChange={(e) =>
                            handleFeatureChange(key, idx, e.target.value)
                          }
                          style={styles.featureInput}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(key, idx)}
                          style={styles.removeButton}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddFeature(key)}
                    style={styles.addButton}
                  >
                    + Agregar feature
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            ...styles.submitButton,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar Planes'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
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
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  planCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  planHeader: {
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderBottom: '3px solid',
  },
  planTitle: {
    margin: '0',
    fontSize: '16px',
    fontWeight: '600',
  },
  planBody: {
    padding: '20px',
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
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: '6px 0 0 0',
  },
  featuresList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  featureItem: {
    display: 'flex',
    gap: '8px',
  },
  featureInput: {
    flex: '1',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
  },
  removeButton: {
    padding: '8px 12px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  addButton: {
    padding: '8px 12px',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
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
  },
};
