import { appConfigService } from '../../services/supabaseService';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockTerminal = jest.fn();
const mockIn       = jest.fn().mockReturnValue({ then: (fn: any) => fn(mockTerminal()) });

jest.mock('@/app/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: (...args: any[]) => mockIn(...args),
      }),
      upsert: jest.fn().mockReturnValue({ then: jest.fn() }),
    }),
  },
  SUPABASE_URL: 'https://test.supabase.co',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockRows(rows: { key: string; value: string }[]) {
  mockIn.mockResolvedValue({ data: rows, error: null });
}

function mockDbError(message: string) {
  mockIn.mockResolvedValue({ data: null, error: new Error(message) });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// ── getAppConfig — boolean parsing ────────────────────────────────────────────

describe('getAppConfig — boolean parsing', () => {
  it('parses "true" string as true', async () => {
    mockRows([{ key: 'discount_enabled', value: 'true' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_enabled).toBe(true);
  });

  it('parses "false" string as false', async () => {
    mockRows([{ key: 'discount_enabled', value: 'false' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_enabled).toBe(false);
  });

  it('uses boolean fallback (true) for hours_restriction_enabled when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.hours_restriction_enabled).toBe(true);
  });

  it('uses boolean fallback (false) for store_manually_closed when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.store_manually_closed).toBe(false);
  });

  it('uses boolean fallback (true) for discount_enabled when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_enabled).toBe(true);
  });

  it('uses boolean fallback (true) for points_enabled when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.points_enabled).toBe(true);
  });
});

// ── getAppConfig — numeric parsing ────────────────────────────────────────────

describe('getAppConfig — numeric parsing', () => {
  it('parses "10" string as number 10 for discount_percentage', async () => {
    mockRows([{ key: 'discount_percentage', value: '10' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_percentage).toBe(10);
  });

  it('parses "15.5" string as number 15.5', async () => {
    mockRows([{ key: 'discount_percentage', value: '15.5' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_percentage).toBe(15.5);
  });

  it('uses numeric fallback (10) for discount_percentage when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_percentage).toBe(10);
  });

  it('uses numeric fallback (0.01) for points_value_rate when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.points_value_rate).toBe(0.01);
  });

  it('uses numeric fallback (5) for points_reward_percentage when key is absent', async () => {
    mockRows([]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.points_reward_percentage).toBe(5);
  });

  it('falls back to default when value is NaN', async () => {
    mockRows([{ key: 'discount_percentage', value: 'not-a-number' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.discount_percentage).toBe(10); // fallback
  });

  it('parses "0.005" correctly for points_value_rate', async () => {
    mockRows([{ key: 'points_value_rate', value: '0.005' }]);
    const { data } = await appConfigService.getAppConfig();
    expect(data?.points_value_rate).toBe(0.005);
  });
});

// ── getAppConfig — mixed rows ─────────────────────────────────────────────────

describe('getAppConfig — mixed rows', () => {
  it('correctly maps multiple keys at once', async () => {
    mockRows([
      { key: 'discount_enabled',    value: 'false' },
      { key: 'discount_percentage', value: '20' },
      { key: 'points_enabled',      value: 'true' },
      { key: 'points_value_rate',   value: '0.02' },
    ]);
    const { data } = await appConfigService.getAppConfig();
    expect(data).toEqual(expect.objectContaining({
      discount_enabled:    false,
      discount_percentage: 20,
      points_enabled:      true,
      points_value_rate:   0.02,
    }));
  });

  it('returns {data:null, error} when Supabase returns an error', async () => {
    mockDbError('DB connection failed');
    const result = await appConfigService.getAppConfig();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

// ── updateAppConfig ───────────────────────────────────────────────────────────

describe('updateAppConfig', () => {
  it('converts boolean config values to strings in the upsert payload', async () => {
    const { supabase } = require('@/app/integrations/supabase/client');
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    await appConfigService.updateAppConfig({ discount_enabled: true });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'discount_enabled', value: 'true' }),
      ]),
      { onConflict: 'key' }
    );
  });

  it('converts numeric config values to strings', async () => {
    const { supabase } = require('@/app/integrations/supabase/client');
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    await appConfigService.updateAppConfig({ discount_percentage: 15 });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'discount_percentage', value: '15' }),
      ]),
      { onConflict: 'key' }
    );
  });

  it('upserts all provided keys', async () => {
    const { supabase } = require('@/app/integrations/supabase/client');
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ upsert: upsertMock });

    await appConfigService.updateAppConfig({
      discount_enabled:    false,
      discount_percentage: 20,
      points_enabled:      true,
    });

    const payload = upsertMock.mock.calls[0][0] as any[];
    expect(payload).toHaveLength(3);
    expect(payload.map((p: any) => p.key).sort()).toEqual([
      'discount_enabled',
      'discount_percentage',
      'points_enabled',
    ]);
  });

  it('returns {error:null} on success', async () => {
    const { supabase } = require('@/app/integrations/supabase/client');
    supabase.from.mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    });

    const result = await appConfigService.updateAppConfig({ discount_enabled: true });
    expect(result.error).toBeNull();
  });
});
