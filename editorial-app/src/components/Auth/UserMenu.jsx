import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function UserMenu({ user, isAdmin, onSignOut }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    setIsOpen(false);
    await onSignOut();
    navigate('/login');
  };

  const getInitial = (name) => {
    return name?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.avatar}
        title={user?.email}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user?.displayName || user?.email}
            style={styles.avatarImage}
          />
        ) : (
          <span style={styles.avatarInitial}>
            {getInitial(user?.displayName)}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={styles.menu}>
          <div style={styles.menuHeader}>
            <p style={styles.menuName}>
              {user?.displayName || user?.email}
            </p>
            <p style={styles.menuEmail}>{user?.email}</p>
          </div>

          <div style={styles.divider}></div>

          {isAdmin && (
            <>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/admin');
                }}
                style={styles.menuItem}
              >
                ⚙️ Panel de administración
              </button>
              <div style={styles.divider}></div>
            </>
          )}

          <button
            onClick={handleSignOut}
            style={{ ...styles.menuItem, ...styles.menuItemLogout }}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  avatar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    transition: 'background-color 0.2s',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  avatarInitial: {
    fontWeight: 'bold',
  },
  menu: {
    position: 'absolute',
    top: '50px',
    right: '0',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '250px',
    zIndex: 1000,
  },
  menuHeader: {
    padding: '12px 16px',
  },
  menuName: {
    margin: '0 0 4px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
  },
  menuEmail: {
    margin: '0',
    fontSize: '12px',
    color: '#9ca3af',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '0',
  },
  menuItem: {
    width: '100%',
    padding: '12px 16px',
    textAlign: 'left',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#374151',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.2s',
  },
  menuItemLogout: {
    color: '#dc2626',
  },
};
