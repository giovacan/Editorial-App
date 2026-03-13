/**
 * SubscriptionBadge Component
 *
 * Small badge showing user's current plan and remaining credits.
 * Reusable in Header, Dashboard, etc.
 */

import React from 'react';
import { useSubscription } from '../hooks/useSubscription';
import './SubscriptionBadge.css';

export function SubscriptionBadge() {
  const { subscription, loading } = useSubscription();

  if (loading) {
    return <div className="subscription-badge subscription-badge--loading">Cargando...</div>;
  }

  const planLabel = {
    free: 'Gratis',
    pro: 'Pro',
    premium: 'Premium'
  }[subscription.plan] || 'Gratis';

  const planColor = {
    free: 'gray',
    pro: 'blue',
    premium: 'purple'
  }[subscription.plan] || 'gray';

  return (
    <div className={`subscription-badge subscription-badge--${planColor}`}>
      <span className="subscription-badge-plan">{planLabel}</span>
      {subscription.credits > 0 && (
        <span className="subscription-badge-credits">
          +{subscription.credits} créditos
        </span>
      )}
    </div>
  );
}
