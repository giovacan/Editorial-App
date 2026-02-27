import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useEditorStore from '../../store/useEditorStore';
import './PaginationProgressBar.css';

function PaginationProgressBar() {
  const { isActive, percent } = useEditorStore(
    useShallow((state) => state.paginationProgress)
  );

  if (!isActive) {
    return null;
  }

  return (
    <div className="pagination-progress-container">
      <div 
        className="pagination-progress-fill" 
        style={{ width: `${percent}%` }} 
      />
    </div>
  );
}

export default memo(PaginationProgressBar);
