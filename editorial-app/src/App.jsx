import useEditorStore from './store/useEditorStore';
import './App.css';

function App() {
  const { ui, document, getStats } = useEditorStore();
  const stats = getStats();

  return (
    <div className="app">
      <h1>Editorial App</h1>
      <p>Estado: {ui.showUpload ? 'Subiendo contenido' : 'Editando'}</p>
      <p>Capítulos: {stats.chapters}</p>
      <p>Palabras: {stats.words}</p>
      <p>Tipo de libro: {document.bookType}</p>
    </div>
  );
}

export default App;
