// Linkedom harnesses schedule animation frames with setTimeout. GSAP also
// cancels those frames when its ticker sleeps; keep the browser API pair intact.
const globals = globalThis as Record<string, unknown>;
globals.requestAnimationFrame ??= (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16);
globals.cancelAnimationFrame ??= (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
