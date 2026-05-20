// Global test setup — runs before the test framework is installed (no beforeAll etc.)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Suppress noisy React Native warnings that aren't relevant to test assertions
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Warning:') || msg.includes('Each child in a list')) return;
  originalConsoleError(...args);
};
