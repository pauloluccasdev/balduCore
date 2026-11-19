import { Worker } from 'node:worker_threads';
import {
  FIT_LIMITS,
  activityDataSchema,
  type ActivityData,
} from './activity-data.js';
export class FitDecodeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
// Sem armazenamento/nomes de arquivo ou payload bruto em logs. Prazo e limites de heap por thread, sem bloquear a API.
export function decodeFit(bytes: Buffer): Promise<ActivityData> {
  if (bytes.length > FIT_LIMITS.bytes)
    return Promise.reject(new FitDecodeError('fit_limits_exceeded'));
  if (bytes.length < 14)
    return Promise.reject(new FitDecodeError('fit_invalid_integrity'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./fit-decoder.worker.js', import.meta.url),
      {
        workerData: Uint8Array.from(bytes),
        resourceLimits: {
          maxOldGenerationSizeMb: FIT_LIMITS.heapMb - 16,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      },
    );
    let settled = false;
    const finish = (result: { ok: boolean; data?: unknown; code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (!result.ok)
        reject(new FitDecodeError(result.code ?? 'fit_decode_failed'));
      else {
        const parsed = activityDataSchema.safeParse(result.data);
        if (parsed.success) resolve(parsed.data);
        else reject(new FitDecodeError('fit_invalid_structure'));
      }
    };
    const timer = setTimeout(
      () => finish({ ok: false, code: 'fit_timeout' }),
      FIT_LIMITS.timeoutMs,
    );
    worker.once('message', finish);
    worker.once('error', () =>
      finish({ ok: false, code: 'fit_resource_limit' }),
    );
    worker.once('exit', () => {
      if (!settled) finish({ ok: false, code: 'fit_decode_failed' });
    });
  });
}
