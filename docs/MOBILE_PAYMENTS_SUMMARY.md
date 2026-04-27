# Square Mobile Payments — Complete Guide for Your Apps

## What You're Getting

4 comprehensive guides + 1 ready-to-use component for integrating Square payments into your React Native/Expo apps (Jagabans L.A. & Peppered Goat):

| File | Purpose | Usage |
|------|---------|-------|
| **SQUARE_MOBILE_PAYMENTS_GUIDE.md** | Comprehensive comparison of all 3 platforms (RN, iOS, Android) | Read first — pick your platform |
| **REACT_NATIVE_SQUARE_SETUP.md** | Step-by-step React Native/Expo setup | Your platform — follow exactly |
| **SquarePaymentScreen.tsx** | Drop-in React Native component | Copy to your project, customize colors |
| **SQUARE_CARD_FIX_GUIDE.md** | Fixes for your current web checkout issue | Also apply to mobile if needed |

---

## Quick Path (React Native/Expo)

You're already using React Native/Expo, so this is your fastest path:

### 1. Install (5 minutes)
```bash
expo install @square/in-app-payments
expo prebuild --clean
```

### 2. Configure (10 minutes)
Add to `.env.local`:
```bash
EXPO_PUBLIC_SQUARE_APPLICATION_ID=sq0atp-xxxxx
EXPO_PUBLIC_SQUARE_LOCATION_ID=Lxxxxx
```

Update `app.json`:
```json
{
  "plugins": [
    ["@square/in-app-payments", {
      "iosScheme": "jagabansla",
      "androidScheme": "jagabansla"
    }]
  ]
}
```

### 3. Use Component (5 minutes)
```tsx
import SquarePaymentScreen from '@/components/SquarePaymentScreen';

<SquarePaymentScreen
  amount={grandTotalCents}
  currency="USD"
  customerInfo={customerInfo}
  onSuccess={(orderId) => {
    // Navigate to confirmation
  }}
  onError={(error) => {
    // Show error
  }}
/>
```

### 4. Backend Edge Function (15 minutes)
Deploy `process-square-payment` edge function (code in REACT_NATIVE_SQUARE_SETUP.md)

### 5. Test & Deploy (30 minutes)
- Test with sandbox cards
- Deploy to staging
- Test on actual devices
- Deploy to production

**Total Time: ~1 hour for basic integration**

---

## Why Square for Mobile?

| Feature | Square | Stripe |
|---------|--------|--------|
| Native mobile SDKs | ✓ Excellent | Moderate |
| Card tokenization | ✓ Secure nonce | Secure token |
| PCI compliance | ✓ Handled | Handled |
| In-app UI | ✓ Built-in | Manual |
| 3DS/SCA | ✓ Automatic | Automatic |
| Webhook support | ✓ Yes | Yes |
| Developer experience | ✓ Good | Good |

You're already using Square on web, so mobile is a natural extension.

---

## Architecture Overview

### Client-Side (Your App)
```
SquarePaymentScreen Component
  ↓
User enters card details (Square's native UI)
  ↓
requestCardNonce() generates secure token
  ↓
Send nonce to your backend
```

### Server-Side (Edge Function)
```
Receive nonce + order details
  ↓
Call Square API to create payment
  ↓
Create order record in Supabase
  ↓
Return success + orderId to app
```

**Key:** Card data NEVER touches your server. Only nonce (token) is sent.

---

## Integration with Your Existing Systems

### Current Web Checkout (Keep as-is)
✓ Stripe web payments working
✓ No changes needed

### New Mobile Checkout
✓ Square mobile payments (separate flow)
✓ Share backend order creation logic
✓ Same database tables

### Data Model
```sql
-- Your existing orders table (add these columns for Square)
orders:
  - id (UUID)
  - user_id (FK)
  - square_payment_id (new)
  - stripe_payment_id (existing)
  - amount_cents
  - status
  - created_at

-- Reference by payment_source:
-- SELECT * FROM orders WHERE stripe_payment_id IS NOT NULL
-- SELECT * FROM orders WHERE square_payment_id IS NOT NULL
```

---

## Customization

### Colors (Match Your Design)
Edit `SquarePaymentScreen.tsx` StyleSheet:

```tsx
// Your current dark luxury system
container: {
  backgroundColor: '#111613', // Dark
},
title: {
  color: '#C9A84C', // Gold accent
},
```

Pre-configured for your aesthetic — no changes needed.

### Layout Options

**1. Full Screen**
```tsx
<SquarePaymentScreen {...props} />
```

**2. Modal/Sheet**
```tsx
<BottomSheetModal>
  <SquarePaymentScreen {...props} />
</BottomSheetModal>
```

**3. As Step in Flow**
```tsx
{currentStep === 'payment' && (
  <SquarePaymentScreen {...props} />
)}
```

---

## Testing

### Test Cards (Sandbox)
```
Visa:       4111 1111 1111 1111
Mastercard: 5555 5555 5555 4444
Amex:       3782 822463 10005
Expiry:     Any future date
CVV:        Any 3 digits
```

### Test Scenarios
1. ✓ Successful payment
2. ✓ Declined card
3. ✓ Network error
4. ✓ Invalid input (missing name)
5. ✓ User cancels

### Monitor in Production
- Square Dashboard → Payments
- Supabase → orders table
- Error logs (implement logging)

---

## Security Checklist

- [ ] Never send raw card data to backend
- [ ] Always use `requestCardNonce()` for tokenization
- [ ] Validate amounts on backend before charging
- [ ] Use `idempotencyKey` to prevent duplicate charges
- [ ] Use webhooks for async confirmation
- [ ] HTTPS only (automatic with Supabase)
- [ ] Store tokens securely (don't log them)
- [ ] Use environment variables for credentials

---

## Troubleshooting

### "Failed to initialize Square"
→ Check `EXPO_PUBLIC_SQUARE_APPLICATION_ID` is set
→ Restart dev server after changing .env

### "Nonce not generated"
→ User canceled card entry
→ SDK not initialized before calling `requestCardNonce()`

### "Payment failed in backend"
→ Check `SQUARE_ACCESS_TOKEN` environment variable
→ Verify token hasn't expired (generate new one in Dashboard)

### "Works in sandbox, fails in production"
→ Using sandbox app ID instead of production
→ Switch `EXPO_PUBLIC_SQUARE_APPLICATION_ID` to production ID

---

## Timeline & Effort

### Phase 1: Setup (Week 1)
- Install SDK
- Get Square credentials
- Configure app.json
- **Effort:** 2-4 hours

### Phase 2: Development (Week 2-3)
- Implement SquarePaymentScreen
- Deploy edge function
- Share backend logic
- **Effort:** 8-12 hours

### Phase 3: Testing (Week 3-4)
- Sandbox testing
- Real device testing
- Error scenarios
- **Effort:** 4-8 hours

### Phase 4: Launch (Week 4)
- Deploy to staging
- Deploy to production
- Monitor first week
- **Effort:** 2-4 hours

**Total: 40-60 hours for full implementation**

---

## Next Steps

1. **Read SQUARE_MOBILE_PAYMENTS_GUIDE.md** for overview of all platforms
2. **Follow REACT_NATIVE_SQUARE_SETUP.md** step-by-step
3. **Copy SquarePaymentScreen.tsx** to your project
4. **Get Square credentials** from Square Dashboard
5. **Implement backend edge function** (code provided)
6. **Test with sandbox cards**
7. **Deploy to production**

---

## Support Resources

| Resource | Link |
|----------|------|
| Square Docs | https://developer.squareup.com/docs/in-app-payments-sdk |
| Expo Docs | https://docs.expo.dev |
| Supabase Edge Functions | https://supabase.com/docs/guides/functions |
| Square SDK Status | https://status.squareup.com |
| This Guide | All files in /outputs folder |

---

## Files Included

```
SQUARE_CARD_FIX_GUIDE.md ............. Web checkout issue + fixes
SQUARE_MOBILE_PAYMENTS_GUIDE.md ...... All platforms (RN/iOS/Android)
REACT_NATIVE_SQUARE_SETUP.md ........ Step-by-step for your stack
SquarePaymentScreen.tsx ............ Ready-to-use component
MOBILE_PAYMENTS_SUMMARY.md ........ This file
```

---

## Questions?

1. **"Should I use Square or Stripe?"** → You're already on Square, stick with it. Same backend, cleaner mobile integration.

2. **"Can I use both web and mobile?"** → Yes. Keep Stripe web, add Square mobile. Share backend logic.

3. **"How long does implementation take?"** → 1 hour basic setup, 40-60 hours full implementation with testing.

4. **"Will this work offline?"** → No, but you can queue orders locally and sync when online.

5. **"Can I test on iOS/Android?"** → Yes, use test cards in sandbox mode on real devices.

---

## Summary

You have everything you need to implement Square payments on your React Native apps in 4-6 weeks. The component is pre-built with your design system. The backend code is provided. The docs are comprehensive.

Start with REACT_NATIVE_SQUARE_SETUP.md and follow step-by-step.

Good luck! 🚀
