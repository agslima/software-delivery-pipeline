import { render } from '@testing-library/react';
// import { ThemeProvider } from './context/ThemeContext'; // Example

const customRender = (ui, options) =>
  render(ui, {
    // wrapper: ThemeProvider, // Wrap all tests with Providers here
    ...options,
  });

export * from '@testing-library/react';
export { customRender as render };