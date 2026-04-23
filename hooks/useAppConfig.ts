import { useEffect, useState, useCallback } from 'react';
import { appConfigService, type AppConfig } from '@/services/supabaseService';
import { supabase } from '@/app/integrations/supabase/client';

const DEFAULT_CONFIG: AppConfig = {
  hours_restriction_enabled: true,
  store_manually_closed: false,
  discount_enabled: true,
  discount_percentage: 10,
  points_enabled: true,
  points_value_rate: 0.01,
points_reward_percentage: 5, // ← add
};

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await appConfigService.getAppConfig();
    if (data) setConfig(data);
    if (error) setError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchConfig();

    // Realtime subscription — fires on any INSERT/UPDATE/DELETE in app_config
    const channel = supabase
      .channel('app_config_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_config',
        },
        (payload) => {
          // A single row changed — merge it into current config
          const { new: newRow } = payload as {
            new: { key: string; value: string };
          };
          if (!newRow?.key) return;

          setConfig((prev) => {
            const boolKeys: (keyof AppConfig)[] = [
              'hours_restriction_enabled',
              'store_manually_closed',
              'discount_enabled',
              'points_enabled',
            ];
            const numKeys: (keyof AppConfig)[] = [
              'discount_percentage',
              'points_value_rate',
            'points_reward_percentage', // ← add
            ];

            const key = newRow.key as keyof AppConfig;

            if (boolKeys.includes(key)) {
              return { ...prev, [key]: newRow.value === 'true' };
            }
            if (numKeys.includes(key)) {
              const parsed = parseFloat(newRow.value);
              return { ...prev, [key]: isNaN(parsed) ? prev[key] : parsed };
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}