import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 0 rgba(59, 130, 246, 0); }
  50% { box-shadow: 0 0 18px rgba(59, 130, 246, 0.18); }
`;

const runnerPulse = keyframes`
  0%, 100% {
    opacity: 0.82;
    transform: translate(0, -50%) scale(0.94);
    filter: blur(0.6px);
  }
  50% {
    opacity: 1;
    transform: translate(1px, -50%) scale(1.06);
    filter: blur(1px);
  }
`;

const sparkDrift = keyframes`
  0% {
    opacity: 0;
    transform: translate(0, -50%) scale(0.74) rotate(-10deg);
  }
  20% {
    opacity: 0.96;
  }
  58% {
    opacity: 0.72;
    transform: translate(6px, -62%) scale(1.02) rotate(3deg);
  }
  100% {
    opacity: 0;
    transform: translate(12px, -74%) scale(0.86) rotate(12deg);
  }
`;

const Anchor = styled.div`
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 6;
  width: min(340px, calc(100% - 32px));
  pointer-events: none;
`;

const Card = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 14px 15px 13px;
  background:
    radial-gradient(circle at top right, rgba(147, 197, 253, 0.42), transparent 40%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 245, 249, 0.93));
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow:
    0 20px 40px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  opacity: ${props => props.$visible ? 1 : 0};
  transform: translateY(${props => props.$visible ? '0' : '-10px'}) scale(${props => props.$visible ? 1 : 0.985});
  transition: opacity 0.28s ease, transform 0.28s ease;
  animation: ${props => props.$done ? glow : 'none'} 0.9s ease-out;
`;

const TopRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const IconWrap = styled.div`
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #1d4ed8;
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.88));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
`;

const TextBlock = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const Eyebrow = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 3px;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
`;

const Detail = styled.div`
  margin-top: 3px;
  font-size: 12px;
  color: #475569;
  line-height: 1.35;
`;

const PercentBadge = styled.div`
  flex: 0 0 auto;
  min-width: 58px;
  padding: 6px 10px;
  border-radius: 999px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: ${props => props.$done ? '#166534' : '#1d4ed8'};
  background: ${props => props.$done
    ? 'linear-gradient(180deg, rgba(220, 252, 231, 0.96), rgba(187, 247, 208, 0.92))'
    : 'linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.92))'};
  border: 1px solid ${props => props.$done ? 'rgba(34, 197, 94, 0.22)' : 'rgba(59, 130, 246, 0.18)'};
`;

const Track = styled.div`
  position: relative;
  margin-top: 12px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(226, 232, 240, 0.92), rgba(203, 213, 225, 0.86));
`;

const Fill = styled.div`
  position: relative;
  height: 100%;
  width: ${props => props.$progress}%;
  min-width: ${props => props.$progress > 0 ? '10px' : '0'};
  border-radius: inherit;
  background:
    linear-gradient(90deg, #1d4ed8 0%, #3b82f6 48%, #7dd3fc 100%);
  transition: width 0.35s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    animation: ${shimmer} 1.6s linear infinite;
  }

  &::before {
    content: '';
    position: absolute;
    right: -3px;
    top: 50%;
    width: 14px;
    height: 6px;
    border-radius: 999px;
    background: radial-gradient(
      ellipse,
      rgba(255, 255, 255, 0.96) 0%,
      rgba(219, 234, 254, 0.88) 34%,
      rgba(125, 211, 252, 0.46) 64%,
      transparent 100%
    );
    animation: ${runnerPulse} 1.5s ease-in-out infinite;
    pointer-events: none;
  }
`;

const TipSparks = styled.span`
  position: absolute;
  right: -1px;
  top: 50%;
  width: 16px;
  height: 12px;
  pointer-events: none;
  background:
    radial-gradient(circle at 2px 9px, rgba(255, 255, 255, 0.98) 0 1px, transparent 1.4px),
    radial-gradient(circle at 7px 4px, rgba(191, 219, 254, 0.94) 0 1px, transparent 1.5px),
    radial-gradient(circle at 10px 8px, rgba(125, 211, 252, 0.86) 0 0.9px, transparent 1.4px),
    radial-gradient(circle at 14px 3px, rgba(255, 255, 255, 0.86) 0 0.9px, transparent 1.3px);
  filter: blur(0.15px);
  transform-origin: left center;
  animation: ${sparkDrift} 0.92s ease-out infinite;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
`;

const Phase = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: #334155;
`;

const PhaseDots = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const PhaseDot = styled.span`
  width: 18px;
  height: 4px;
  border-radius: 999px;
  background: ${props => props.$active
    ? 'linear-gradient(90deg, #2563eb, #7dd3fc)'
    : 'rgba(148, 163, 184, 0.35)'};
  opacity: ${props => props.$active ? 1 : 0.8};
  transition: background 0.25s ease, opacity 0.25s ease;
`;

const clampProgress = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const getProgressMeta = (progress) => {
  if (progress >= 100) {
    return {
      eyebrow: 'Maquetacion lista',
      title: 'Vista previa actualizada',
      detail: 'La nueva composicion ya esta lista para revisarse.',
      phase: 'Completado',
      done: true,
      activeDots: 4,
    };
  }

  if (progress < 14) {
    return {
      eyebrow: 'Preparando',
      title: 'Iniciando paginacion',
      detail: 'Estamos cargando tipografia, margenes y contexto del manuscrito.',
      phase: 'Preparar',
      done: false,
      activeDots: 1,
    };
  }

  if (progress < 52) {
    return {
      eyebrow: 'Midiendo',
      title: 'Calculando cortes y alturas',
      detail: 'El motor esta revisando capitulos, bloques y saltos de pagina.',
      phase: 'Medir',
      done: false,
      activeDots: 2,
    };
  }

  if (progress < 88) {
    return {
      eyebrow: 'Ajustando',
      title: 'Equilibrando la maqueta',
      detail: 'Estamos acomodando quiebres, llenado y continuidad entre paginas.',
      phase: 'Ajustar',
      done: false,
      activeDots: 3,
    };
  }

  return {
    eyebrow: 'Afinando',
    title: 'Pulido final',
    detail: 'Ultimos retoques antes de mostrar el resultado final.',
    phase: 'Pulir',
    done: false,
    activeDots: 4,
  };
};

const PaginationProgressBar = ({ progress = 0, isVisible = false }) => {
  const normalized = clampProgress(progress);
  const [shouldRender, setShouldRender] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      return undefined;
    }

    const timeout = window.setTimeout(() => setShouldRender(false), 260);
    return () => window.clearTimeout(timeout);
  }, [isVisible]);

  if (!shouldRender && !isVisible) return null;

  const meta = getProgressMeta(normalized);

  return (
    <Anchor aria-live="polite" aria-atomic="true" role="status">
      <Card $visible={isVisible} $done={meta.done}>
        <TopRow>
          <IconWrap aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17.5A2.5 2.5 0 0 0 17.5 17H5z" />
              <path d="M5 4.5V22" />
              <path d="M8.5 7H16.5" />
              <path d="M8.5 10.5H15" />
            </svg>
          </IconWrap>

          <TextBlock>
            <Eyebrow>{meta.eyebrow}</Eyebrow>
            <Title>{meta.title}</Title>
            <Detail>{meta.detail}</Detail>
          </TextBlock>

          <PercentBadge $done={meta.done}>
            {meta.done ? 'Listo' : `${normalized}%`}
          </PercentBadge>
        </TopRow>

        <Track>
          <Fill $progress={normalized}>
            <TipSparks />
          </Fill>
        </Track>

        <MetaRow>
          <Phase>{meta.phase}</Phase>
          <PhaseDots aria-hidden="true">
            {[0, 1, 2, 3].map((idx) => (
              <PhaseDot key={idx} $active={idx < meta.activeDots} />
            ))}
          </PhaseDots>
        </MetaRow>
      </Card>
    </Anchor>
  );
};

export default PaginationProgressBar;
