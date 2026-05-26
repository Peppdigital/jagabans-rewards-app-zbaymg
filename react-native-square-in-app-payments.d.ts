declare module 'react-native-square-in-app-payments' {
  export interface Card {
    brand?: number;
    lastFourDigits?: string;
    expirationMonth?: number;
    expirationYear?: number;
    postalCode?: string;
    type?: number;
    prepaidType?: number;
  }

  export interface CardDetails {
    nonce?: string;
    card?: Card;
  }

  export interface CardEntryConfig {
    collectPostalCode: boolean;
    squareLocationId?: string;
    buyerAction?: 'Charge' | 'Store';
    amount?: number;
    currencyCode?: string;
    givenName?: string;
    familyName?: string;
    addressLines?: string[];
    city?: string;
    countryCode?: string;
    email?: string;
    phone?: string;
    postalCode?: string;
    region?: string;
  }

  export interface NonceSuccessResult {
    success: boolean;
    errorMessage?: string;
    onCardEntryComplete?: () => void;
  }

  export type NonceSuccessCallbackWithResult = (
    cardDetails: CardDetails
  ) => NonceSuccessResult | Promise<NonceSuccessResult>;

  export type CancelAndCompleteCallback = () => void;

  export namespace SQIPCore {
    function setSquareApplicationId(applicationId: string): void;
    function getSquareApplicationId(): string | null;
  }

  export namespace SQIPCardEntry {
    function startCardEntryFlow(
      collectPostalCode: boolean,
      onCardNonceRequestSuccess?: NonceSuccessCallbackWithResult,
      onCardEntryCancel?: CancelAndCompleteCallback
    ): void;

    function startCardEntryFlow(
      config: CardEntryConfig,
      onCardNonceRequestSuccess?: NonceSuccessCallbackWithResult,
      onCardEntryCancel?: CancelAndCompleteCallback
    ): void;

    function completeCardEntry(
      onCardEntryComplete?: CancelAndCompleteCallback
    ): void;

    function showCardNonceProcessingError(errorMessage: string): void;
  }
}
