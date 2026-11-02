/**
 * OSIRIS OI Assist: one turn of the conversation.
 *
 * The reader says something; the model answers with words and actions; the
 * page carries the actions out, in order; if the model asked to see their
 * results it gets them and goes again, up to a handful of steps, until it has
 * its answer. The model step and the actions are passed in, so this loop runs
 * the same against the real page and server or against test doubles.
 */
import type { AssistContext, AssistMessage, Call, CallResult, Mode, Step } from './protocol';
import type { Outcome } from './tools';

export type Progress =
  | { type: 'step'; step: number; say: string; calls: Call[]; done: boolean }
  | { type: 'result'; step: number; call: number; outcome: Outcome };

export interface TurnDeps {
  step: (messages: AssistMessage[], context: AssistContext, signal?: AbortSignal) => Promise<Step>;
  exec: (call: Call, signal?: AbortSignal) => Promise<Outcome>;
  context: () => AssistContext;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  /** Model steps at most, so a model that keeps asking cannot run on. */
  maxSteps?: number;
}

/** Runs a turn and returns the conversation with it added. */
export async function converse(history: AssistMessage[], text: string, mode: Mode, deps: TurnDeps): Promise<AssistMessage[]> {
  let messages: AssistMessage[] = [...history, { role: 'user', text, mode }];
  const max = deps.maxSteps ?? 5;
  for (let i = 0; i < max; i++) {
    if (deps.signal?.aborted) break;
    const st = await deps.step(messages, deps.context(), deps.signal);
    messages = [...messages, { role: 'assistant', say: st.say, calls: st.calls }];
    deps.onProgress?.({ type: 'step', step: i, say: st.say, calls: st.calls, done: st.done });
    if (st.calls.length) {
      const results: CallResult[] = [];
      for (const [j, call] of st.calls.entries()) {
        if (deps.signal?.aborted) break;
        let outcome: Outcome;
        try {
          outcome = await deps.exec(call, deps.signal);
        } catch (err) {
          if (deps.signal?.aborted) break;
          outcome = { result: { tool: call.tool, ok: false, summary: err instanceof Error ? err.message : 'failed' } };
        }
        results.push(outcome.result);
        deps.onProgress?.({ type: 'result', step: i, call: j, outcome });
      }
      messages = [...messages, { role: 'tool', results }];
    }
    if (st.done) break;
  }
  return messages;
}
