import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';
import { appConfigService } from '@/services/supabaseService';
import Toast from '@/components/Toast';
import { useAppConfig } from '@/hooks/useAppConfig';

export default function StoreSettingsScreen() {
  const router = useRouter();
  const { config, loading: configLoading } = useAppConfig();

  // Store hours local state
  const [hoursRestrictedEnabled, setHoursRestrictedEnabled] = useState(true);
  const [storeManuallyClosedState, setStoreManuallyClosedState] = useState(false);

  // Pricing local state
  const [discountEnabled, setDiscountEnabled] = useState(true);
  const [discountPercentage, setDiscountPercentage] = useState(10);
  const [discountInput, setDiscountInput] = useState('10');
  const [pointsEnabled, setPointsEnabled] = useState(true);
  const [pointsValueRate, setPointsValueRate] = useState(0.01);
  const [pointsRateInput, setPointsRateInput] = useState('0.01');
  const [pointsRewardPercentage, setPointsRewardPercentage] = useState(5);
  const [pointsRewardInput, setPointsRewardInput] = useState('5');
  const [pricingLoading, setPricingLoading] = useState(false);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  };

  // Sync from realtime config
  useEffect(() => {
    setHoursRestrictedEnabled(config.hours_restriction_enabled);
    setStoreManuallyClosedState(config.store_manually_closed);
    setDiscountEnabled(config.discount_enabled);
    setDiscountPercentage(config.discount_percentage);
    setDiscountInput(String(config.discount_percentage));
    setPointsEnabled(config.points_enabled);
    setPointsValueRate(config.points_value_rate);
    setPointsRateInput(String(config.points_value_rate));
    setPointsRewardPercentage(config.points_reward_percentage);
    setPointsRewardInput(String(config.points_reward_percentage));
  }, [config]);

  // ── Store hours handlers ────────────────────────────────────────────────

  const handleToggleHoursRestricted = async (value: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await appConfigService.updateAppConfig({ hours_restriction_enabled: value });
    if (error) {
      showToast('error', 'Failed to update hours setting');
    } else {
      showToast('success', value ? 'Operating hours enabled' : 'Store set to always open');
    }
  };

  const handleToggleStoreManuallyClosedState = async (value: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await appConfigService.updateAppConfig({ store_manually_closed: value });
    if (error) {
      showToast('error', 'Failed to update store status');
    } else {
      showToast('success', value ? 'Store manually closed' : 'Store reopened');
    }
  };

  // ── Pricing handlers ────────────────────────────────────────────────────

  const handleToggleDiscountEnabled = async (value: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPricingLoading(true);
    const { error } = await appConfigService.updateAppConfig({ discount_enabled: value });
    setPricingLoading(false);
    if (error) {
      showToast('error', 'Failed to update discount setting');
    } else {
      showToast('success', value ? 'Discount enabled' : 'Discount disabled');
    }
  };

  const handleSaveDiscountPercentage = async () => {
    const parsed = parseFloat(discountInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      showToast('error', 'Enter a valid percentage between 0 and 100');
      setDiscountInput(String(discountPercentage));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    setPricingLoading(true);
    const { error } = await appConfigService.updateAppConfig({ discount_percentage: rounded });
    setPricingLoading(false);
    if (error) {
      showToast('error', 'Failed to save discount percentage');
      setDiscountInput(String(discountPercentage));
    } else {
      showToast('success', `Discount set to ${rounded}%`);
    }
  };

  const handleTogglePointsEnabled = async (value: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPricingLoading(true);
    const { error } = await appConfigService.updateAppConfig({ points_enabled: value });
    setPricingLoading(false);
    if (error) {
      showToast('error', 'Failed to update points setting');
    } else {
      showToast('success', value ? 'Points system enabled' : 'Points system disabled');
    }
  };

  const handleSavePointsValueRate = async () => {
    const parsed = parseFloat(pointsRateInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 1) {
      showToast('error', 'Enter a value between 0 and 1 (e.g. 0.01 = $0.01 per point)');
      setPointsRateInput(String(pointsValueRate));
      return;
    }
    const rounded = Math.round(parsed * 10000) / 10000;
    setPricingLoading(true);
    const { error } = await appConfigService.updateAppConfig({ points_value_rate: rounded });
    setPricingLoading(false);
    if (error) {
      showToast('error', 'Failed to save points value');
      setPointsRateInput(String(pointsValueRate));
    } else {
      showToast('success', `Points value set to $${rounded} per point`);
    }
  };

  const handleSavePointsRewardPercentage = async () => {
    const parsed = parseFloat(pointsRewardInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      showToast('error', 'Enter a valid percentage between 0 and 100');
      setPointsRewardInput(String(pointsRewardPercentage));
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    setPricingLoading(true);
    const { error } = await appConfigService.updateAppConfig({ points_reward_percentage: rounded });
    setPricingLoading(false);
    if (error) {
      showToast('error', 'Failed to save points reward percentage');
      setPointsRewardInput(String(pointsRewardPercentage));
    } else {
      showToast('success', `Points reward set to ${rounded}%`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Store Settings</Text>
          <Text style={styles.headerSubtitle}>Hours & Pricing Controls</Text>
        </View>
        {(configLoading || pricingLoading) ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.headerLoader} />
        ) : (
          <View style={styles.headerLoader} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Store Hours Section ─────────────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <IconSymbol
            name={Platform.OS === 'ios' ? 'clock.fill' : 'schedule'}
            size={15}
            color={colors.primary}
          />
          <Text style={styles.sectionLabelText}>STORE HOURS</Text>
        </View>

        <View style={styles.card}>
          {/* Use Operating Hours */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Use Operating Hours</Text>
              <Text style={styles.rowHint}>
                {hoursRestrictedEnabled
                  ? 'Ordering follows scheduled hours'
                  : 'Store is always open for ordering'}
              </Text>
            </View>
            <Switch
              value={hoursRestrictedEnabled}
              onValueChange={handleToggleHoursRestricted}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.border}
              disabled={configLoading}
            />
          </View>

          <View style={styles.divider} />

          {/* Manually Close Store */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Manually Close Store</Text>
              <Text style={[styles.rowHint, storeManuallyClosedState && styles.rowHintDanger]}>
                {storeManuallyClosedState
                  ? 'Store is closed — overrides all hours settings'
                  : 'Store is open (no manual override)'}
              </Text>
            </View>
            <Switch
              value={storeManuallyClosedState}
              onValueChange={handleToggleStoreManuallyClosedState}
              trackColor={{ false: colors.border, true: '#E74C3C' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.border}
              disabled={configLoading}
            />
          </View>
        </View>

        {/* ── Discount Section ────────────────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <IconSymbol name="percent" size={15} color={colors.primary} />
          <Text style={styles.sectionLabelText}>DISCOUNTS</Text>
        </View>

        <View style={styles.card}>
          {/* Enable Discount toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Enable Order Discount</Text>
              <Text style={styles.rowHint}>
                {discountEnabled
                  ? `${discountPercentage}% discount applied to all orders`
                  : 'No discount applied'}
              </Text>
            </View>
            <Switch
              value={discountEnabled}
              onValueChange={handleToggleDiscountEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.border}
              disabled={pricingLoading}
            />
          </View>

          {discountEnabled && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>Discount Percentage</Text>
                  <Text style={styles.rowHint}>Applied to order subtotal</Text>
                </View>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={discountInput}
                    onChangeText={setDiscountInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveDiscountPercentage}
                    onBlur={handleSaveDiscountPercentage}
                    editable={!pricingLoading}
                    maxLength={6}
                    selectTextOnFocus
                  />
                  <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>%</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Points Section ──────────────────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <IconSymbol name="star.fill" size={15} color={colors.primary} />
          <Text style={styles.sectionLabelText}>POINTS SYSTEM</Text>
        </View>

        <View style={styles.card}>
          {/* Enable Points toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Enable Points System</Text>
              <Text style={styles.rowHint}>
                {pointsEnabled
                  ? `Earn ${pointsRewardPercentage}% back · redeem at $${pointsValueRate}/pt`
                  : 'Points earning and redemption disabled'}
              </Text>
            </View>
            <Switch
              value={pointsEnabled}
              onValueChange={handleTogglePointsEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.border}
              disabled={pricingLoading}
            />
          </View>

          {pointsEnabled && (
            <>
              <View style={styles.divider} />

              {/* $ value per point */}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>Value Per Point</Text>
                  <Text style={styles.rowHint}>Dollar value when redeeming 1 point</Text>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputPrefix, { color: colors.textSecondary }]}>$</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={pointsRateInput}
                    onChangeText={setPointsRateInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSavePointsValueRate}
                    onBlur={handleSavePointsValueRate}
                    editable={!pricingLoading}
                    maxLength={6}
                    selectTextOnFocus
                  />
                </View>
              </View>

              <View style={styles.divider} />

              {/* Points reward percentage */}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>Points Reward Rate</Text>
                  <Text style={styles.rowHint}>% of order subtotal awarded as points</Text>
                </View>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={pointsRewardInput}
                    onChangeText={setPointsRewardInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSavePointsRewardPercentage}
                    onBlur={handleSavePointsRewardPercentage}
                    editable={!pricingLoading}
                    maxLength={6}
                    selectTextOnFocus
                  />
                  <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>%</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Live sync note */}
        <View style={styles.footer}>
          <IconSymbol name="dot.radiowaves.left.and.right" size={14} color={colors.primary} />
          <Text style={styles.footerText}>
            Changes apply in real-time across the app
          </Text>
        </View>

      </ScrollView>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
        currentColors={{ text: colors.text, background: colors.background, primary: colors.primary }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headerLoader: {
    width: 36,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  // Section label (above each card)
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // Row inside card
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  rowHintDanger: {
    color: '#E74C3C',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  // Input
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  input: {
    width: 76,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputSuffix: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 14,
  },
  inputPrefix: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 10,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
    opacity: 0.6,
  },
  footerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});