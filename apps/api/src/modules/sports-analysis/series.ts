import type { Input } from './calculations.js';
import { distanceAxis, GAP_SECONDS } from './calculations.js';
export const SERIES_LIMIT = 2000;
export type Channel = 'pace' | 'heartRate' | 'cadence' | 'altitude';
export function series(input: Input, axis: 'time' | 'distance') {
  const distanceAvailable = distanceAxis(input.samples);
  const effectiveAxis =
    axis === 'distance' && distanceAvailable ? 'distance' : 'time';
  const coordinates = input.samples.map((sample) => ({
    ordinal: sample.ordinal,
    timestamp: sample.timestamp.toISOString(),
    x:
      effectiveAxis === 'distance'
        ? sample.distanceMeters!
        : (sample.timestamp.getTime() - input.startedAt.getTime()) / 1000,
  }));
  const values = {
    pace: input.samples.map((sample) =>
      sample.speedMetersPerSecond !== null && sample.speedMetersPerSecond > 0
        ? 1000 / sample.speedMetersPerSecond
        : null,
    ),
    heartRate: input.samples.map((sample) => sample.heartRateBpm),
    cadence: input.samples.map((sample) => sample.cadenceRpm),
    altitude: input.samples.map((sample) => sample.altitudeMeters),
  };
  const names = ['pace', 'heartRate', 'cadence', 'altitude'] as const;
  // Mesmos índices em todos os canais: cursor por valor permanece sincronizado.
  // Cada bucket preserva primeira/última observação e mín./máx. dos quatro canais.
  const chosen = new Set<number>();
  const size = Math.max(
    1,
    Math.ceil(coordinates.length / Math.floor(SERIES_LIMIT / 10)),
  );
  for (let start = 0; start < coordinates.length; start += size) {
    const end = Math.min(coordinates.length - 1, start + size - 1);
    chosen.add(start);
    chosen.add(end);
    for (const name of names) {
      let min: number | undefined, max: number | undefined;
      for (let index = start; index <= end; index++) {
        if (values[name][index] === null) continue;
        if (min === undefined || values[name][index]! < values[name][min]!)
          min = index;
        if (max === undefined || values[name][index]! > values[name][max]!)
          max = index;
      }
      if (min !== undefined) chosen.add(min);
      if (max !== undefined) chosen.add(max);
    }
  }
  const indexes = [...chosen].sort((a, b) => a - b);
  const channels = names.map((channel) => {
    let previous = -1;
    const points = indexes.map((index) => {
      let breakBefore = false;
      for (let cursor = Math.max(1, previous + 1); cursor <= index; cursor++)
        if (
          values[channel][cursor] === null ||
          values[channel][cursor - 1] === null ||
          (input.samples[cursor].timestamp.getTime() -
            input.samples[cursor - 1].timestamp.getTime()) /
            1000 >
            GAP_SECONDS ||
          input.samples[cursor].timestamp <= input.samples[cursor - 1].timestamp
        )
          breakBefore = true;
      previous = index;
      return {
        ...coordinates[index],
        value: values[channel][index],
        breakBefore,
      };
    });
    return {
      channel,
      originalCount: coordinates.length,
      knownCount: values[channel].filter((value) => value !== null).length,
      reduced: points.length < coordinates.length,
      points,
    };
  });
  return {
    axis: effectiveAxis,
    requestedAxis: axis,
    distanceAxisAvailable: distanceAvailable,
    limit: SERIES_LIMIT,
    channels,
  };
}
