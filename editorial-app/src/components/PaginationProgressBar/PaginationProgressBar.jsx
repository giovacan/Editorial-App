import React from 'react';
import styled from 'styled-components';

const ProgressBarContainer = styled.div`
  position: relative;
  width: 100%;
  height: 10px;
  background: linear-gradient(180deg, #f5f5f5, #e0e0e0);
  border-radius: 6px;
  overflow: hidden;
  margin: 12px 0;
  opacity: ${props => props.isVisible ? 1 : 0};
  transition: opacity 0.3s ease;
  display: ${props => props.isVisible ? 'block' : 'none'};
  border: 1px solid #d0d0d0;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #007bff, #0056b3);
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  animation: shimmer 2s infinite;
  
  @keyframes shimmer {
    0% { background-position: -200px 0; }
    100% { background-position: 200px 0; }
  }
  
  background: linear-gradient(90deg, #007bff, #0056b3);
  background-size: 200px 100%;
  
  &:hover {
    animation-play-state: paused;
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: shimmer 1.5s infinite;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.3), transparent);
    pointer-events: none;
  }
`;

const ProgressText = styled.span`
  position: absolute;
  top: -22px;
  right: 0;
  font-size: 11px;
  color: #666;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.95);
  padding: 3px 8px;
  border-radius: 14px;
  border: 1px solid #d0d0d0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  backdrop-filter: blur(2px);
`;

const ProgressLabel = styled.div`
  font-size: 12px;
  color: #444;
  margin-bottom: 6px;
  font-weight: 600;
  letter-spacing: 0.2px;
`;

const PaginationProgressBar = ({ progress, isVisible, compact = false }) => {
  if (!isVisible) return null;

  return (
    <div style={{ 
      marginBottom: compact ? '8px' : '16px', 
      transition: 'all 0.3s ease',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      <ProgressLabel>
        📄 Paginando contenido... {Math.round(progress)}%
      </ProgressLabel>
      <ProgressBarContainer isVisible={isVisible}>
        <ProgressFill progress={progress} />
        <ProgressText>{Math.round(progress)}% completado</ProgressText>
      </ProgressBarContainer>
      {progress === 100 && (
        <div style={{
          fontSize: '11px',
          color: '#007bff',
          marginTop: '4px',
          textAlign: 'right',
          fontWeight: '500',
          animation: 'pulse 1s ease-in-out infinite',
          textShadow: '0 0 4px rgba(0,123,255,0.3)',
          cursor: 'pointer'
        }} 
        title="¡Listo para exportar!"
        onClick={() => {
          // Optional: Add a click handler for completion message
          console.log('Pagination completed!');
        }}>
          ✅ Paginación completada
        </div>
      )}
    </div>
  );
};

export default PaginationProgressBar;