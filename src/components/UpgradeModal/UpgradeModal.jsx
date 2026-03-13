/**
 * UpgradeModal Component
 *
 * Modal shown when user tries to exceed plan limits.
 * Displays upgrade options and benefits of next plan.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getNextPlan } from '../../services/subscriptions';
import './UpgradeModal.css';

const UPGRADE_MESSAGES = {
  books: {
    title: 'Límite de libros alcanzado',
    message: 'Tu plan actual te permite crear hasta {maxBooks} libros.',
    cta: 'Ver planes disponibles'
  },
  exports: {
    title: 'Créditos de exportación agotados',
    message: 'Tu plan actual incluye {maxExports} exportaciones al mes.',
    cta: 'Comprar más créditos'
  }
};

const PLAN_BENEFITS = {
  pro: [
    '✓ Hasta 20 libros',
    '✓ 50 exportaciones/mes',
    '✓ Exportación a Word y ePub',
    '✓ Soporte por email',
    '$9.99 al mes'
  ],
  premium: [
    '✓ Libros ilimitados',
    '✓ Exportaciones ilimitadas',
    '✓ Colaboración en equipo',
    '✓ Integración API',
    '✓ Soporte prioritario',
    '$19.99 al mes'
  ]
};

export function UpgradeModal({ type, currentPlan, planConfig, onClose }) {
  const navigate = useNavigate();
  const nextPlan = getNextPlan(currentPlan);
  const nextBenefits = PLAN_BENEFITS[nextPlan] || [];
  const message = UPGRADE_MESSAGES[type];

  const formattedMessage = message.message
    .replace('{maxBooks}', planConfig.maxBooks)
    .replace('{maxExports}', planConfig.maxExports);

  const handleUpgrade = () => {
    navigate('/pricing');
    onClose();
  };

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="upgrade-modal-header">
          <h2>{message.title}</h2>
        </div>

        <div className="upgrade-modal-body">
          <p className="upgrade-modal-message">{formattedMessage}</p>

          {nextBenefits.length > 0 && (
            <div className="upgrade-modal-benefits">
              <h3>Plan {nextPlan.toUpperCase()} incluye:</h3>
              <ul>
                {nextBenefits.map((benefit, idx) => (
                  <li key={idx}>{benefit}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="upgrade-modal-footer">
          <button
            className="upgrade-modal-btn-secondary"
            onClick={onClose}
          >
            Continuar sin actualizar
          </button>
          <button
            className="upgrade-modal-btn-primary"
            onClick={handleUpgrade}
          >
            {message.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
