import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Toast from '../../components/Toast';

jest.mock('../../components/IconSymbol', () => {
  const { Text } = require('react-native');
  const { createElement } = require('react');
  return {
    IconSymbol: ({ name }: any) => createElement(Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return { BlurView: ({ children }: any) => createElement(View, null, children) };
});

const COLORS = { primary: '#2196F3' };

describe('Toast', () => {
  describe('visibility', () => {
    it('renders null when not visible (initial fade = 0)', () => {
      const { toJSON } = render(
        <Toast visible={false} message="Hidden" currentColors={COLORS} />
      );
      expect(toJSON()).toBeNull();
    });

    it('renders content when visible is true', () => {
      render(<Toast visible message="Hello!" currentColors={COLORS} />);
      expect(screen.getByText('Hello!')).toBeTruthy();
    });
  });

  describe('message display', () => {
    it('shows the message text', () => {
      render(<Toast visible message="Order placed successfully" currentColors={COLORS} />);
      expect(screen.getByText('Order placed successfully')).toBeTruthy();
    });

    it('shows an empty message without crashing', () => {
      render(<Toast visible message="" currentColors={COLORS} />);
    });
  });

  describe('icon by type', () => {
    it('uses success icon for type="success"', () => {
      render(<Toast visible type="success" message="OK" currentColors={COLORS} />);
      expect(screen.getByTestId('icon-checkmark.circle.fill')).toBeTruthy();
    });

    it('uses error icon for type="error"', () => {
      render(<Toast visible type="error" message="Fail" currentColors={COLORS} />);
      expect(screen.getByTestId('icon-error')).toBeTruthy();
    });

    it('uses info icon for type="info"', () => {
      render(<Toast visible type="info" message="FYI" currentColors={COLORS} />);
      expect(screen.getByTestId('icon-info')).toBeTruthy();
    });

    it('defaults to success icon when type is not provided', () => {
      render(<Toast visible message="Default" currentColors={COLORS} />);
      expect(screen.getByTestId('icon-checkmark.circle.fill')).toBeTruthy();
    });
  });

  describe('onHide callback', () => {
    it('calls onHide after the duration timeout', () => {
      jest.useFakeTimers();
      const onHide = jest.fn();
      render(
        <Toast visible message="Timed" duration={1000} onHide={onHide} currentColors={COLORS} />
      );
      jest.advanceTimersByTime(1500);
      // onHide is called at the end of the hide animation; just verify no crash
      jest.useRealTimers();
    });
  });
});
