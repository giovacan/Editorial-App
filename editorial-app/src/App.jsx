import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import Layout from './components/Layout/Layout';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  );
}

export default App;
