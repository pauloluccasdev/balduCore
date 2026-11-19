import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  compare,
  distanceAxis,
  segment,
  segmentSchema,
} from './modules/sports-analysis/calculations.js';
import { series, SERIES_LIMIT } from './modules/sports-analysis/series.js';
import {
  analysisInput,
  analysisSample,
  analysisSplit,
  ANALYSIS_START,
} from './test-support/analysis-fixture.js';
test('regras inclusivas exigem limiares absolutos/relativos, bases e splits comparáveis; evidência completa', () => {
  const input = analysisInput({
    splits: [
      analysisSplit(0),
      analysisSplit(1, {
        timerSeconds: 230,
        avgHeartRateBpm: 150,
        avgCadenceRpm: 88,
      }),
    ],
  });
  const result = analyze(input);
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].delta, 30);
  assert.equal(result.events[0].relativeDelta, 0.15);
  assert.equal(result.events[0].current.basis, 'timer');
  assert.equal(result.events[0].previous.durationSeconds, 200);
  input.splits[1].timerSeconds = 229.99;
  assert.equal(
    analyze(input).events.filter((event) => event.type === 'pace_change')
      .length,
    0,
  );
  input.splits[1].distanceMeters = 100;
  assert.equal(analyze(input).events.length, 0);
  input.splits[1] = analysisSplit(1, {
    timerSeconds: null,
    elapsedSeconds: 230,
    avgHeartRateBpm: 155,
  });
  assert.equal(analyze(input).events.length, 0);
  input.splits[1] = analysisSplit(2, { timerSeconds: 230 });
  assert.equal(analyze(input).events.length, 0);
});
test('nenhum evento fabricado: sensores ausentes, splits curtos, outra modalidade e falta de splits', () => {
  const input = analysisInput({
    sport: 'cycling',
    splits: [
      analysisSplit(0, {
        timerSeconds: 20,
        avgHeartRateBpm: null,
        avgCadenceRpm: null,
      }),
      analysisSplit(1, {
        timerSeconds: 40,
        avgHeartRateBpm: 160,
        avgCadenceRpm: 90,
      }),
    ],
  });
  assert.equal(analyze(input).events.length, 0);
  assert.equal(
    analyze(analysisInput({ splits: [], samples: [] })).events.length,
    0,
  );
  const missing = analyze(
    analysisInput({
      splits: [
        analysisSplit(0, { distanceMeters: null }),
        analysisSplit(1, { distanceMeters: null, avgHeartRateBpm: 150 }),
      ],
    }),
  );
  assert.equal(missing.events.length, 1);
  assert.equal(missing.events[0].distanceMissing, true);
});
test('trechos preservam limites observados, tempo decorrido, zeros e sensores ausentes', () => {
  const samples = [0, 100, 200, 300].map((seconds, index) =>
    analysisSample(index, {
      timestamp: new Date(ANALYSIS_START.getTime() + seconds * 1000),
      distanceMeters: index * 1000,
      cadenceRpm: index === 1 ? 0 : index === 2 ? 80 : null,
      heartRateBpm: index === 1 ? 150 : null,
    }),
  );
  const input = analysisInput({ samples });
  const result = segment(input, { kind: 'time', from: 10, to: 210 });
  assert.equal(result.available, true);
  assert.ok(
    'actual' in result && result.actual && 'fromOrdinal' in result.actual,
  );
  assert.equal(result.actual?.from, 100);
  assert.equal(result.actual?.to, 200);
  assert.ok('durationSeconds' in result);
  assert.equal(result.durationSeconds, 100);
  assert.equal(result.distanceMeters, 1000);
  assert.equal(result.basis, 'elapsed');
  assert.equal(result.paceSecondsPerKm, 100);
  assert.equal(result.gaps, 1);
  assert.equal(result.cadence?.mean, 40);
  assert.equal(result.heartRate?.count, 1);
  assert.equal(result.heartRate?.missing, 1);
  const empty = segment(input, { kind: 'time', from: 400, to: 500 });
  assert.equal(empty.available, false);
  samples[2].timestamp = samples[1].timestamp;
  const duplicate = segment(input, { kind: 'time', from: 100, to: 100 });
  assert.ok('durationSeconds' in duplicate);
  assert.equal(duplicate.durationSeconds, null);
  assert.equal(duplicate.paceSecondsPerKm, null);
});
test('splits desiguais usam razão das somas; dados parciais/bases diferentes não geram totais integrais', () => {
  const input = analysisInput({
    splits: [
      analysisSplit(0, { distanceMeters: 500, timerSeconds: 200 }),
      analysisSplit(1, { distanceMeters: 1500, timerSeconds: 300 }),
    ],
  });
  const aggregate = segment(input, { kind: 'splits', from: 0, to: 1 });
  assert.ok('paceSecondsPerKm' in aggregate);
  assert.equal(aggregate.paceSecondsPerKm, 250);
  input.splits[1].timerSeconds = null;
  const mixed = segment(input, { kind: 'splits', from: 0, to: 1 });
  assert.ok('durationSeconds' in mixed);
  assert.equal(mixed.durationSeconds, null);
  assert.equal(mixed.incomplete, true);
  assert.equal(
    compare(input, [
      { kind: 'time', from: 0, to: 1 },
      { kind: 'splits', from: 0, to: 0 },
    ]).comparable,
    false,
  );
  assert.equal(
    segmentSchema.safeParse({ kind: 'splits', from: 1.5, to: 2 }).success,
    false,
  );
  assert.equal(
    segmentSchema.safeParse({ kind: 'time', from: 20, to: 10 }).success,
    false,
  );
});
test('distância incompleta/regressiva não permite seleção por km; lacunas e nulos não são interpolados', () => {
  const input = analysisInput({
    samples: [
      analysisSample(0),
      analysisSample(1, { distanceMeters: null, speedMetersPerSecond: 0 }),
      analysisSample(2, {
        timestamp: new Date(ANALYSIS_START.getTime() + 40000),
        speedMetersPerSecond: null,
      }),
    ],
  });
  assert.equal(distanceAxis(input.samples), false);
  assert.deepEqual(segment(input, { kind: 'distance', from: 0, to: 1000 }), {
    requested: { kind: 'distance', from: 0, to: 1000 },
    available: false,
    reason: 'distance_axis_unavailable',
  });
  const chart = series(input, 'distance');
  assert.equal(chart.axis, 'time');
  assert.equal(chart.channels[0].points[1].value, null);
  assert.equal(chart.channels[0].points[2].breakBefore, true);
  assert.ok(analyze(input).quality.includes('recording_gaps'));
  input.samples[1].distanceMeters = 20;
  input.samples[2].distanceMeters = 10;
  assert.equal(distanceAxis(input.samples), false);
});
test('redução preserva extremos e lacunas sem alterar resolução dos cálculos', () => {
  const samples = Array.from({ length: 20000 }, (_, index) =>
    analysisSample(index, {
      heartRateBpm: index === 9955 ? 220 : 140,
      cadenceRpm: index === 9956 ? 0 : 80,
    }),
  );
  samples[9957].heartRateBpm = null;
  const input = analysisInput({ samples });
  const charts = series(input, 'time');
  for (const channel of charts.channels) {
    assert.ok(channel.points.length <= SERIES_LIMIT);
    assert.equal(channel.originalCount, 20000);
    assert.equal(channel.reduced, true);
  }
  for (const channel of charts.channels)
    assert.deepEqual(
      channel.points.map((point) => point.ordinal),
      charts.channels[0].points.map((point) => point.ordinal),
    );
  const heart = charts.channels[1];
  assert.ok(heart.points.some((point) => point.value === 220));
  assert.ok(
    heart.points.some((point) => point.ordinal > 9957 && point.breakBefore),
  );
  assert.ok(charts.channels[2].points.some((point) => point.value === 0));
  const result = segment(input, { kind: 'time', from: 0, to: 19999 });
  assert.ok('sampleCount' in result);
  assert.equal(result.sampleCount, 20000);
});

test('distância zero observada permanece zero no trecho temporal; ritmo continua indisponível', () => {
  const input = analysisInput({
    samples: [
      analysisSample(0, { distanceMeters: 0, speedMetersPerSecond: 0 }),
      analysisSample(1, { distanceMeters: 0, speedMetersPerSecond: 0 }),
    ],
  });
  const result = segment(input, { kind: 'time', from: 0, to: 1 });
  assert.ok('distanceMeters' in result);
  assert.equal(result.distanceMeters, 0);
  assert.equal(result.durationSeconds, 1);
  assert.equal(result.paceSecondsPerKm, null);
  assert.equal(
    compare(input, [
      { kind: 'time', from: 0, to: 0 },
      { kind: 'time', from: 0, to: 1 },
    ]).comparable,
    false,
  );
});
