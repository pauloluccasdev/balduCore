import { z } from 'zod';
const text = z.string().trim().max(4000);
const range = {
  from: z.number().finite().nonnegative(),
  to: z.number().finite().nonnegative(),
};
export const scopeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('whole') }).strict(),
    z.object({ kind: z.literal('time'), ...range }).strict(),
    z.object({ kind: z.literal('distance'), ...range }).strict(),
  ])
  .refine((scope) => scope.kind === 'whole' || scope.from < scope.to);
export const contentSchema = z
  .object({
    execution: text,
    observations: text,
    decisions: text,
    points: z
      .array(
        z
          .object({
            id: z.uuid(),
            category: z.enum([
              'walk',
              'stop',
              'hydration',
              'nutrition',
              'climb',
              'discomfort',
              'pace',
              'other',
            ]),
            source: z.enum(['coach_observation', 'athlete_report']),
            note: z.string().trim().min(1).max(1000),
            scope: scopeSchema,
          })
          .strict(),
      )
      .max(20),
    verdicts: z
      .array(
        z
          .object({
            eventId: z.string().min(1).max(80),
            verdict: z.enum(['correct', 'partial', 'incorrect']),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine(
    (body) =>
      new Set(body.points.map((p) => p.id)).size === body.points.length &&
      new Set(body.verdicts.map((v) => v.eventId)).size ===
        body.verdicts.length,
  );
export const saveSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(2147483646),
    inputRevision: z.number().int().positive(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    analysisId: z.uuid().nullable(),
    confirmContext: z.boolean().default(false),
    content: contentSchema,
  })
  .strict();
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const emptyContent = () => ({
  execution: '',
  observations: '',
  decisions: '',
  points: [],
  verdicts: [],
});
export type FeedbackContent = z.infer<typeof contentSchema>;
