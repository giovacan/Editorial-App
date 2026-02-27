import { useState, useEffect } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AdminStats() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    usersByPlan: { free: 0, pro: 0, premium: 0 },
    totalBooks: 0,
    totalExports: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Get all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const totalUsers = usersSnapshot.size;

      let usersByPlan = { free: 0, pro: 0, premium: 0 };
      let totalBooks = 0;
      let totalExports = 0;

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        // Count users by plan
        const plan = userData.subscription?.plan || 'free';
        if (usersByPlan[plan] !== undefined) {
          usersByPlan[plan]++;
        }

        // Count books
        totalBooks += userData.stats?.booksCount || 0;

        // Count exports
        totalExports += userData.stats?.exportsCount || 0;
      });

      setStats({
        totalUsers,
        usersByPlan,
        totalBooks,
        totalExports,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.container}>Cargando estadísticas...</div>;
  }

  const planStats = [
    { plan: 'free', label: 'Gratuito', color: '#9ca3af', count: stats.usersByPlan.free },
    { plan: 'pro', label: 'Pro', color: '#3b82f6', count: stats.usersByPlan.pro },
    { plan: 'premium', label: 'Premium', color: '#8b5cf6', count: stats.usersByPlan.premium },
  ];

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Estadísticas del Negocio</h2>

      <div style={styles.grid}>
        {/* Total Users */}
        <div style={styles.card}>
          <div style={styles.cardContent}>
            <div style={styles.icon}>👥</div>
            <div style={styles.cardInfo}>
              <p style={styles.cardLabel}>Usuarios registrados</p>
              <p style={styles.cardValue}>{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        {/* Total Books */}
        <div style={styles.card}>
          <div style={styles.cardContent}>
            <div style={styles.icon}>📚</div>
            <div style={styles.cardInfo}>
              <p style={styles.cardLabel}>Total de libros creados</p>
              <p style={styles.cardValue}>{stats.totalBooks}</p>
            </div>
          </div>
        </div>

        {/* Total Exports */}
        <div style={styles.card}>
          <div style={styles.cardContent}>
            <div style={styles.icon}>📄</div>
            <div style={styles.cardInfo}>
              <p style={styles.cardLabel}>Total de exportaciones</p>
              <p style={styles.cardValue}>{stats.totalExports}</p>
            </div>
          </div>
        </div>

        {/* Estimated Revenue */}
        <div style={styles.card}>
          <div style={styles.cardContent}>
            <div style={styles.icon}>💰</div>
            <div style={styles.cardInfo}>
              <p style={styles.cardLabel}>Usuarios pagos (mensual)</p>
              <p style={styles.cardValue}>
                {stats.usersByPlan.pro + stats.usersByPlan.premium}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Distribution */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>📊 Distribución de Usuarios por Plan</h3>

        <div style={styles.chartGrid}>
          {planStats.map(({ plan, label, color, count }) => {
            const percentage = stats.totalUsers > 0
              ? Math.round((count / stats.totalUsers) * 100)
              : 0;

            return (
              <div key={plan} style={styles.chartItem}>
                <div style={styles.chartLabel}>
                  <span style={{ color }}>{label}</span>
                  <span style={styles.chartCount}>{count} usuarios</span>
                </div>
                <div style={styles.chartBar}>
                  <div
                    style={{
                      ...styles.chartFill,
                      width: `${percentage}%`,
                      backgroundColor: color,
                    }}
                  ></div>
                </div>
                <div style={styles.chartPercent}>{percentage}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>📈 Resumen</h3>
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <span>Promedio de libros por usuario:</span>
            <strong>
              {stats.totalUsers > 0
                ? (stats.totalBooks / stats.totalUsers).toFixed(1)
                : '0'}
            </strong>
          </div>
          <div style={styles.summaryItem}>
            <span>Promedio de exportaciones por usuario:</span>
            <strong>
              {stats.totalUsers > 0
                ? (stats.totalExports / stats.totalUsers).toFixed(1)
                : '0'}
            </strong>
          </div>
          <div style={styles.summaryItem}>
            <span>Tasa de pago:</span>
            <strong>
              {stats.totalUsers > 0
                ? (
                    ((stats.usersByPlan.pro + stats.usersByPlan.premium) /
                      stats.totalUsers) *
                    100
                  ).toFixed(1)
                : '0'}
              %
            </strong>
          </div>
        </div>
      </div>

      <button
        onClick={() => location.reload()}
        style={styles.refreshButton}
      >
        🔄 Actualizar
      </button>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    padding: '20px',
  },
  cardContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  icon: {
    fontSize: '40px',
  },
  cardInfo: {
    flex: '1',
  },
  cardLabel: {
    margin: '0',
    fontSize: '14px',
    color: '#6b7280',
    fontWeight: '500',
  },
  cardValue: {
    margin: '8px 0 0 0',
    fontSize: '32px',
    fontWeight: '700',
    color: '#1f2937',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    padding: '20px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
    margin: '0 0 20px 0',
    paddingBottom: '10px',
    borderBottom: '1px solid #e5e7eb',
  },
  chartGrid: {
    display: 'grid',
    gap: '20px',
  },
  chartItem: {
    marginBottom: '20px',
  },
  chartLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    marginBottom: '8px',
    fontWeight: '500',
  },
  chartCount: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  chartBar: {
    width: '100%',
    height: '20px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  chartFill: {
    height: '100%',
    transition: 'width 0.3s',
  },
  chartPercent: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  summary: {
    display: 'grid',
    gap: '12px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    padding: '8px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  refreshButton: {
    padding: '10px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
};
