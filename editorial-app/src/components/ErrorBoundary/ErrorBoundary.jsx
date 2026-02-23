import { Component } from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error capturado:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h2>Algo salió mal</h2>
          <p className="error-message">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>Recargar página</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
