export interface SchedulerOptions {
  intervalMs: number;
  onError: (error: unknown) => void;
  task: (signal: AbortSignal) => Promise<void>;
}

class SchedulerStoppedError extends Error {
  constructor() {
    super("Scheduler stopped");
    this.name = "AbortError";
  }
}

/** Runs a polling task serially; the next delay starts after the task settles. */
export class SerialPollingScheduler {
  private activeController: AbortController | null = null;
  private activeTask: Promise<void> | null = null;
  private stopped = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SchedulerOptions) {
    if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
      throw new Error("Scheduler interval must be a positive integer");
    }
  }

  start(runImmediately: boolean): void {
    if (!this.stopped) {
      throw new Error("Scheduler is already running");
    }
    if (this.activeTask !== null) {
      throw new Error("Scheduler is still stopping");
    }

    this.stopped = false;
    this.schedule(runImmediately ? 0 : this.options.intervalMs);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      const controller = new AbortController();
      this.activeController = controller;
      this.activeTask = Promise.resolve()
        .then(() => this.options.task(controller.signal))
        .catch((error: unknown) => {
          if (!(this.stopped && controller.signal.aborted)) {
            this.options.onError(error);
          }
        })
        .finally(() => {
          if (this.activeController === controller) {
            this.activeController = null;
          }
          this.activeTask = null;
          this.schedule(this.options.intervalMs);
        });
    }, delayMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const activeTask = this.activeTask;
    this.activeController?.abort(new SchedulerStoppedError());
    await activeTask;
  }
}
