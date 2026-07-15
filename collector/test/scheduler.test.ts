import { describe, expect, it, vi } from "vitest";

import { SerialPollingScheduler } from "../src/framework/scheduler.js";

describe("SerialPollingScheduler", () => {
  it("never overlaps task executions", async () => {
    vi.useFakeTimers();
    let active = 0;
    let maximumActive = 0;
    let release: (() => void) | undefined;
    const task = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active -= 1;
    });
    const scheduler = new SerialPollingScheduler({
      intervalMs: 100,
      onError: vi.fn(),
      task,
    });

    try {
      scheduler.start(true);
      await vi.advanceTimersByTimeAsync(500);
      expect(task).toHaveBeenCalledTimes(1);

      release?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(task).toHaveBeenCalledTimes(2);
      expect(maximumActive).toBe(1);

      const stopping = scheduler.stop();
      release?.();
      await stopping;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the active task, waits for it, and does not schedule another run", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    let taskSettled = false;
    const task = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          receivedSignal = signal;
          signal.addEventListener(
            "abort",
            () => {
              taskSettled = true;
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new DOMException("Task aborted", "AbortError"),
              );
            },
            { once: true },
          );
        }),
    );
    const onError = vi.fn();
    const scheduler = new SerialPollingScheduler({
      intervalMs: 100,
      onError,
      task,
    });

    try {
      scheduler.start(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(task).toHaveBeenCalledOnce();

      await scheduler.stop();

      expect(receivedSignal?.aborted).toBe(true);
      expect(taskSettled).toBe(true);
      expect(onError).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(task).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
