// Global type declarations for window properties and external libraries
declare global {
  interface Window {
    __theme?: string;
    __themeInitialized?: boolean;
    __themeApplied?: boolean;
    JSZip: any;
  }
}

// Timeout type fix for Node.js vs Browser environments
declare global {
  type TimeoutId = ReturnType<typeof setTimeout>;
}

export {};