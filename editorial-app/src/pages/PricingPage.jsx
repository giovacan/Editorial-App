/**
 * PricingPage Component
 *
 * Public pricing page showing subscription plans and credit packages.
 * Accessible at /pricing
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { redirectToCheckout, redirectToCreditsCheckout, isCheckoutSuccess } from '../services/stripe';
import { CREDIT_PACKAGES } from '../data/creditPackages';
import { SubscriptionBadge } from '../components/SubscriptionBadge';
import './PricingPage.css';

const PLANS = [
  {
    id: 'free',
    name: 'Gratis',
    price: '0',
    period: 'para siempre',
    description: 'Perfecto para comenzar',
    features: [
      'Hasta 3 libros',
      '5 exportaciones/mes',
      'Exportación a PDF',
      'Edición básica',
      'Sin watermark'
    ],
    cta: 'Plan actual',
    ctaVariant: 'secondary',
    highlight: false
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '9,99',
    period: 'al mes',
    description: 'Para escritores activos',
    features: [
      'Todo en Gratis',
      'Hasta 20 libros',
      '50 exportaciones/mes',
      'Exportación a Word y ePub',
      'Soporte por email'
    ],
    cta: 'Actualizar a Pro',
    ctaVariant: 'primary',
    highlight: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '19,99',
    period: 'al mes',
    description: 'Para profesionales',
    features: [
      'Todo en Pro',
      'Libros ilimitados',
      'Exportaciones ilimitadas',
      'Colaboración en equipo',
      'Integración API',
      'Soporte prioritario'
    ],
    cta: 'Actualizar a Premium',
    ctaVariant: 'primary',
    highlight: true
  }
];

export function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(isCheckoutSuccess());

  const handlePlanUpgrade = async (planId) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (subscription.plan === planId) {
      return; // Already on this plan
    }

    setLoadingPlan(planId);
    setError(null);

    try {
      await redirectToCheckout(planId, user.uid);
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Error al procesar el pago. Por favor intenta de nuevo.');
      setLoadingPlan(null);
    }
  };

  const handleCreditsCheckout = async (packageId) => {
    if (!user) {
      navigate('/login');
      return;
    }

    setLoadingPlan(packageId);
    setError(null);

    try {
      await redirectToCreditsCheckout(packageId, user.uid);
    } catch (err) {
      console.error('Credits checkout error:', err);
      setError('Error al procesar la compra. Por favor intenta de nuevo.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1>Planes de Precios</h1>
        <p>Elige el plan perfecto para tus necesidades</p>

        {user && (
          <div className="pricing-user-plan">
            Plan actual: <SubscriptionBadge />
          </div>
        )}
      </div>

      {showSuccess && (
        <div className="pricing-success">
          ✓ Pago completado exitosamente. Tu plan ha sido actualizado.
          <button onClick={() => setShowSuccess(false)}>×</button>
        </div>
      )}

      {error && (
        <div className="pricing-error">
          ⚠ {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Subscription Plans */}
      <div className="pricing-plans">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`pricing-card ${plan.highlight ? 'pricing-card--highlight' : ''}`}
          >
            {plan.highlight && <div className="pricing-card-badge">Popular</div>}

            <div className="pricing-card-header">
              <h2>{plan.name}</h2>
              <div className="pricing-card-price">
                <span className="currency">$</span>
                <span className="amount">{plan.price}</span>
                <span className="period">/{plan.period}</span>
              </div>
              <p className="pricing-card-description">{plan.description}</p>
            </div>

            <ul className="pricing-card-features">
              {plan.features.map((feature, idx) => (
                <li key={idx}>
                  <span className="feature-check">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              className={`pricing-card-btn pricing-card-btn--${plan.ctaVariant}`}
              onClick={() => handlePlanUpgrade(plan.id)}
              disabled={loadingPlan === plan.id || (user && subscription.plan === plan.id)}
            >
              {loadingPlan === plan.id ? 'Procesando...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Credit Packages */}
      <div className="pricing-credits-section">
        <h2>Comprar Créditos Adicionales</h2>
        <p>Agrega exportaciones extra sin cambiar de plan</p>

        <div className="pricing-credits-grid">
          {CREDIT_PACKAGES.map(pkg => (
            <div key={pkg.id} className="pricing-credit-card">
              {pkg.badge && <div className="pricing-credit-badge">{pkg.badge}</div>}

              <h3>{pkg.label}</h3>
              <p className="pricing-credit-desc">{pkg.description}</p>

              <div className="pricing-credit-price">
                <span className="currency">$</span>
                <span className="amount">{pkg.price}</span>
              </div>

              <p className="pricing-credit-value">
                {(pkg.price / pkg.exports).toFixed(2)}¢ por exportación
              </p>

              <button
                className="pricing-credit-btn"
                onClick={() => handleCreditsCheckout(pkg.id)}
                disabled={loadingPlan === pkg.id || !user}
              >
                {loadingPlan === pkg.id ? 'Procesando...' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ-like section */}
      <div className="pricing-faq">
        <h2>Preguntas Frecuentes</h2>

        <div className="pricing-faq-item">
          <h3>¿Puedo cambiar de plan en cualquier momento?</h3>
          <p>Sí, puedes cambiar de plan en cualquier momento. Los cambios se aplican en el próximo ciclo de facturación.</p>
        </div>

        <div className="pricing-faq-item">
          <h3>¿Se renuevan los créditos cada mes?</h3>
          <p>Los créditos de tu suscripción se renuevan cada mes. Los créditos comprados individualmente no caducan.</p>
        </div>

        <div className="pricing-faq-item">
          <h3>¿Hay período de prueba?</h3>
          <p>No necesitas tarjeta de crédito para probar el plan Gratis. Puedes actualizar en cualquier momento.</p>
        </div>
      </div>

      {!user && (
        <div className="pricing-cta">
          <p>¿Listo para empezar?</p>
          <button className="pricing-cta-btn" onClick={() => navigate('/register')}>
            Crear cuenta ahora
          </button>
        </div>
      )}
    </div>
  );
}
