/**
 * useExportQuota Hook
 *
 * Manages export quota and credit deduction for users.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from './useSubscription';
import { checkExportPermission, deductExport, getExportStats } from '../services/exports';

/**
 * Hook to manage export quota and permissions
 *
 * @returns {Object} {
 *   canExport: boolean,
 *   remainingExports: number,
 *   exportsThisMonth: number,
 *   loading: boolean,
 *   error: Error | null,
 *   checkPermission: () => Promise<{canExport, remaining, message}>
 *   deductAndExport: (exportFn) => Promise<any>
 *   getStats: () => Promise<{exportsThisMonth, totalExports, lastExportDate}>
 * }
 */
export function useExportQuota() {
  const { user } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exportsThisMonth, setExportsThisMonth] = useState(0);

  const checkPermission = useCallback(async () => {
    if (!user || !subscription) {
      return { canExport: false, remaining: 0, message: 'No autenticado' };
    }

    try {
      const result = await checkExportPermission(user.uid, subscription);
      return result;
    } catch (err) {
      console.error('Error checking export permission:', err);
      setError(err);
      return { canExport: false, remaining: 0, message: 'Error al verificar permisos' };
    }
  }, [user, subscription]);

  /**
   * Execute export function and deduct quota
   *
   * Usage:
   * ```js
   * const { deductAndExport } = useExportQuota();
   *
   * const handleExport = async () => {
   *   const result = await deductAndExport(async () => {
   *     // Your export code here
   *     return await generatePDF();
   *   });
   *   if (result.success) console.log('Exported!');
   * };
   * ```
   *
   * @param {Function} exportFn - Async function to execute export
   * @returns {Promise<{success: boolean, result?: any, error?: Error, remaining?: number}>}
   */
  const deductAndExport = useCallback(async (exportFn) => {
    if (!user) {
      return { success: false, error: new Error('No autenticado') };
    }

    setLoading(true);
    setError(null);

    try {
      // Check permission first
      const permission = await checkPermission();
      if (!permission.canExport) {
        return { success: false, error: new Error(permission.message) };
      }

      // Execute the export
      const result = await exportFn();

      // Deduct the export
      const deductResult = await deductExport(user.uid);

      setExportsThisMonth(prev => prev + 1);

      return {
        success: true,
        result,
        remaining: deductResult.remainingExports,
        creditsDeducted: deductResult.creditsDeducted
      };
    } catch (err) {
      console.error('Error during export:', err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [user, checkPermission]);

  const getStats = useCallback(async () => {
    if (!user) return { exportsThisMonth: 0, totalExports: 0, lastExportDate: null };

    try {
      const stats = await getExportStats(user.uid);
      setExportsThisMonth(stats.exportsThisMonth);
      return stats;
    } catch (err) {
      console.error('Error getting export stats:', err);
      setError(err);
      throw err;
    }
  }, [user]);

  // Calculate remaining exports
  const planLimits = {
    free: 5,
    pro: 50,
    premium: -1
  };

  const planLimit = planLimits[subscription?.plan] || 5;
  const creditsAvailable = subscription?.credits || 0;
  const remaining = planLimit === -1
    ? -1 // unlimited
    : Math.max(0, planLimit - exportsThisMonth + creditsAvailable);

  return {
    canExport: remaining !== 0, // False only if remaining === 0 and not unlimited
    remainingExports: remaining,
    exportsThisMonth,
    loading: loading || subLoading,
    error,
    checkPermission,
    deductAndExport,
    getStats
  };
}
