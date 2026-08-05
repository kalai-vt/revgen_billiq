// Runs once before the test suite. Extends Vitest's `expect` with jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) for every test file in this project.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react normally auto-registers this via a global `afterEach` (Jest-style
// globals). This project runs Vitest without `test.globals`, so it's wired up explicitly here
// instead — without it, the DOM from one test's render() leaks into the next test in the same
// file.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver. BaseEChart (src/lib/echarts/BaseEChart.tsx) observes its
// container to trigger chart resizing, so anything rendering it needs this stub.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
