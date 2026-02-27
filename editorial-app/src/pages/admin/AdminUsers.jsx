import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const usersData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div style={styles.container}>Cargando usuarios...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Gestión de Usuarios</h2>

      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Buscar por email o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div style={styles.empty}>
          {users.length === 0
            ? 'No hay usuarios registrados'
            : 'No se encontraron usuarios'}
        </div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <div style={{ ...styles.tableCell, flex: 2 }}>Email</div>
            <div style={{ ...styles.tableCell, flex: 1.5 }}>Nombre</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Plan</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Libros</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Estado</div>
          </div>

          {filteredUsers.map((user) => (
            <div key={user.id} style={styles.tableRow}>
              <div style={{ ...styles.tableCell, flex: 2 }}>
                <code style={styles.code}>{user.email}</code>
              </div>
              <div style={{ ...styles.tableCell, flex: 1.5 }}>
                {user.displayName || '-'}
              </div>
              <div style={{ ...styles.tableCell, flex: 1 }}>
                <span style={styles.badge}>
                  {user.subscription?.plan || 'free'}
                </span>
              </div>
              <div style={{ ...styles.tableCell, flex: 1 }}>
                {user.stats?.booksCount || 0}
              </div>
              <div style={{ ...styles.tableCell, flex: 1 }}>
                <span
                  style={{
                    ...styles.status,
                    backgroundColor: user.disabled ? '#fecaca' : '#d1fae5',
                    color: user.disabled ? '#7f1d1d' : '#065f46',
                  }}
                >
                  {user.disabled ? 'Bloqueado' : 'Activo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={styles.info}>
        Total: <strong>{filteredUsers.length}</strong> usuario(s)
      </p>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1000px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#1f2937',
    margin: '0 0 30px 0',
  },
  searchBox: {
    marginBottom: '20px',
  },
  searchInput: {
    width: '100%',
    maxWidth: '400px',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  empty: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#9ca3af',
    backgroundColor: 'white',
    borderRadius: '8px',
  },
  table: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    marginBottom: '20px',
  },
  tableHeader: {
    display: 'flex',
    backgroundColor: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: '600',
    fontSize: '14px',
  },
  tableRow: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s',
  },
  tableCell: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#374151',
  },
  code: {
    backgroundColor: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  status: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  info: {
    color: '#6b7280',
    fontSize: '14px',
  },
};
