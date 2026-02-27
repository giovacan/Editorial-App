import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingPlan, setEditingPlan] = useState('');
  const [editingCredits, setEditingCredits] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setEditingPlan(user.subscription?.plan || 'free');
    setEditingCredits(user.subscription?.credits || 0);
  };

  const handleSaveUser = async (userId) => {
    setSaving(true);
    setMessage('');
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        'subscription.plan': editingPlan,
        'subscription.credits': parseInt(editingCredits, 10),
        'subscription.status': 'active',
      });

      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, subscription: { ...u.subscription, plan: editingPlan, credits: parseInt(editingCredits, 10) } }
          : u
      ));

      setMessage('✓ Usuario actualizado exitosamente');
      setEditingUserId(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving user:', error);
      setMessage('✗ Error al actualizar usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setEditingPlan('');
    setEditingCredits('');
  };

  if (loading) {
    return <div style={styles.container}>Cargando usuarios...</div>;
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Gestión de Usuarios</h2>

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
            <div style={{ ...styles.tableCell, flex: 0.8 }}>Créditos</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Libros</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Estado</div>
            <div style={{ ...styles.tableCell, flex: 1 }}>Acciones</div>
          </div>

          {filteredUsers.map((user) => (
            <div key={user.id}>
              {editingUserId === user.id ? (
                // Edit mode
                <div style={styles.tableRow}>
                  <div style={{ ...styles.tableCell, flex: 2 }}>
                    <code style={styles.code}>{user.email}</code>
                  </div>
                  <div style={{ ...styles.tableCell, flex: 1.5 }}>
                    {user.displayName || '-'}
                  </div>
                  <div style={{ ...styles.tableCell, flex: 1 }}>
                    <select
                      value={editingPlan}
                      onChange={(e) => setEditingPlan(e.target.value)}
                      style={styles.selectInput}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                  <div style={{ ...styles.tableCell, flex: 0.8 }}>
                    <input
                      type="number"
                      value={editingCredits}
                      onChange={(e) => setEditingCredits(e.target.value)}
                      min="0"
                      style={styles.numberInput}
                    />
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
                  <div style={{ ...styles.tableCell, flex: 1, gap: '8px' }}>
                    <button
                      onClick={() => handleSaveUser(user.id)}
                      disabled={saving}
                      style={{ ...styles.actionButton, ...styles.saveButton }}
                    >
                      {saving ? 'Guardando...' : '✓'}
                    </button>
                    <button
                      onClick={handleCancel}
                      style={{ ...styles.actionButton, ...styles.cancelButton }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div style={styles.tableRow}>
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
                  <div style={{ ...styles.tableCell, flex: 0.8 }}>
                    <span style={styles.credits}>
                      {user.subscription?.credits || 0}
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
                  <div style={{ ...styles.tableCell, flex: 1 }}>
                    <button
                      onClick={() => handleEditUser(user)}
                      style={styles.editButton}
                    >
                      ✏️ Editar
                    </button>
                  </div>
                </div>
              )}
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
    gap: '0',
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
  selectInput: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  numberInput: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    width: '70px',
    fontFamily: 'inherit',
  },
  credits: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  editButton: {
    padding: '6px 12px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  actionButton: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  saveButton: {
    backgroundColor: '#10b981',
    color: 'white',
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    color: 'white',
  },
};
