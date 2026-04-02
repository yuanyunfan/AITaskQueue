import '@testing-library/jest-dom/vitest'

// Reset all zustand stores between tests
afterEach(() => {
  // Zustand stores are module-level singletons.
  // Each test file should call store.setState() to reset if needed.
})
