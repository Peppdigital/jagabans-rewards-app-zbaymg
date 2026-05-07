import { useApp } from '@/contexts/AppContext';

/**
 * Thin wrapper that reads app config from AppContext.
 * AppContext owns the single Supabase realtime subscription for app_config,
 * so components don't create duplicate channels.
 */
export function useAppConfig() {
  const { appConfig } = useApp();
  return { config: appConfig, loading: false, error: null, refetch: async () => {} };
}
