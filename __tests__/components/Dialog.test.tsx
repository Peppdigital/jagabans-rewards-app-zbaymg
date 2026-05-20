import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import Dialog from '../../components/Dialog';

jest.mock('../../components/IconSymbol', () => {
  const { Text } = require('react-native');
  const { createElement } = require('react');
  return {
    IconSymbol: ({ name }: any) => createElement(Text, null, name),
  };
});

const COLORS = {
  card: '#1A1A1A',
  text: '#F5F5F5',
  textSecondary: '#888888',
  primary: '#4AD7C2',
  background: '#0A0A0A',
};

describe('Dialog', () => {
  describe('visibility', () => {
    it('renders the modal when visible is true', () => {
      render(
        <Dialog
          visible
          title="Confirm"
          message="Are you sure?"
          currentColors={COLORS}
        />
      );
      expect(screen.getByText('Confirm')).toBeTruthy();
      expect(screen.getByText('Are you sure?')).toBeTruthy();
    });

    it('does not show title or message content when not visible', () => {
      render(
        <Dialog
          visible={false}
          title="Hidden Title"
          message="Hidden message"
          currentColors={COLORS}
        />
      );
      // Modal is rendered but content inside may not be visible; at minimum no crash
      expect(screen.queryByText('Hidden Title')).toBeNull();
    });
  });

  describe('content rendering', () => {
    it('shows the title text', () => {
      render(<Dialog visible title="Delete Order" currentColors={COLORS} />);
      expect(screen.getByText('Delete Order')).toBeTruthy();
    });

    it('shows the message text', () => {
      render(<Dialog visible message="This cannot be undone." currentColors={COLORS} />);
      expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    });

    it('renders all button labels', () => {
      render(
        <Dialog
          visible
          buttons={[
            { text: 'Cancel', onPress: jest.fn(), style: 'cancel' },
            { text: 'Delete', onPress: jest.fn(), style: 'destructive' },
          ]}
          currentColors={COLORS}
        />
      );
      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Delete')).toBeTruthy();
    });

    it('renders with no buttons without crashing', () => {
      render(<Dialog visible title="Info" buttons={[]} currentColors={COLORS} />);
      expect(screen.getByText('Info')).toBeTruthy();
    });
  });

  describe('button interactions', () => {
    it('calls button.onPress when tapped', () => {
      const onPress = jest.fn();
      render(
        <Dialog
          visible
          buttons={[{ text: 'Confirm', onPress }]}
          currentColors={COLORS}
        />
      );
      fireEvent.press(screen.getByText('Confirm'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('calls onHide when any button is tapped', () => {
      const onHide = jest.fn();
      render(
        <Dialog
          visible
          onHide={onHide}
          buttons={[{ text: 'OK', onPress: jest.fn() }]}
          currentColors={COLORS}
        />
      );
      fireEvent.press(screen.getByText('OK'));
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('calls both button.onPress and onHide on press', () => {
      const onPress = jest.fn();
      const onHide  = jest.fn();
      render(
        <Dialog
          visible
          onHide={onHide}
          buttons={[{ text: 'Go', onPress }]}
          currentColors={COLORS}
        />
      );
      fireEvent.press(screen.getByText('Go'));
      expect(onPress).toHaveBeenCalled();
      expect(onHide).toHaveBeenCalled();
    });

    it('calls the correct button handler when multiple buttons are present', () => {
      const onCancel  = jest.fn();
      const onConfirm = jest.fn();
      render(
        <Dialog
          visible
          buttons={[
            { text: 'Cancel',  onPress: onCancel  },
            { text: 'Confirm', onPress: onConfirm },
          ]}
          currentColors={COLORS}
        />
      );
      fireEvent.press(screen.getByText('Confirm'));
      expect(onConfirm).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
