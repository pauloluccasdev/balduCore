import {
  Encoder,
  Profile,
  type FileIdMesg,
  type RecordMesg,
  type LapMesg,
  type SessionMesg,
} from '@garmin/fitsdk';

// Fixtures binárias geradas, exclusivamente sintéticas; nenhuma atividade de pessoa real.
export function sampleActivity(
  start = new Date('2026-11-18T12:00:00.000Z'),
  options: {
    detailed?: boolean;
    recordCount?: number;
    sessionCount?: number;
    order?: 'reversed' | 'untimed';
  } = {},
) {
  const end = new Date(start.getTime() + (options.detailed ? 430_000 : 20_000));
  const encoder = new Encoder();
  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    timeCreated: start,
  };
  const records: RecordMesg[] = [
    { timestamp: start, distance: 0, speed: 0 },
    {
      timestamp: new Date(start.getTime() + 10_000),
      distance: 40,
      speed: 4,
      heartRate: 150,
    },
    { timestamp: end, distance: 90, speed: 5 },
  ];
  const lap: LapMesg = {
    messageIndex: 0,
    timestamp: end,
    startTime: start,
    totalDistance: 90,
    totalTimerTime: 20,
    totalElapsedTime: 22,
  };
  const session: SessionMesg = {
    timestamp: end,
    startTime: start,
    sport: 'running',
    totalDistance: 90,
    totalTimerTime: 20,
    totalElapsedTime: 22,
    firstLapIndex: 0,
    numLaps: 1,
  };
  if (options.detailed) {
    records.splice(
      0,
      records.length,
      ...Array.from({ length: 44 }, (_, index): RecordMesg => ({
        timestamp: new Date(start.getTime() + index * 10000),
        distance: index <= 20 ? index * 50 : 1000 + ((index - 20) * 1000) / 23,
        speed: index <= 20 ? 5 : 1000 / 230,
        heartRate: index === 14 ? undefined : index <= 20 ? 140 : 150,
        cadence: index <= 20 ? 80 : 88,
        altitude: 100 + Math.sin(index / 4) * 10,
      })),
    );
    Object.assign(lap, {
      timestamp: new Date(start.getTime() + 200000),
      totalDistance: 1000,
      totalTimerTime: 200,
      totalElapsedTime: 200,
      avgHeartRate: 140,
      avgCadence: 80,
    });
    Object.assign(session, {
      totalDistance: 2000,
      totalTimerTime: 430,
      totalElapsedTime: 430,
      numLaps: 2,
      avgHeartRate: 145,
      maxHeartRate: 150,
      avgCadence: 84,
    });
  }
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);
  const emitted =
    options.recordCount === undefined
      ? records
      : Array.from(
          { length: options.recordCount },
          (_, index) =>
            ({
              timestamp: new Date(start.getTime() + index * 1000),
            }) as RecordMesg,
        );
  if (options.order === 'reversed') emitted.reverse();
  if (options.order === 'untimed') delete emitted[0].timestamp;
  for (const record of emitted) encoder.onMesg(Profile.MesgNum.RECORD, record);
  encoder.onMesg(Profile.MesgNum.LAP, lap);
  if (options.detailed) {
    const second: LapMesg = {
      messageIndex: 1,
      startTime: new Date(start.getTime() + 200000),
      timestamp: end,
      totalDistance: 1000,
      totalTimerTime: 230,
      totalElapsedTime: 230,
      avgHeartRate: 150,
      avgCadence: 88,
    };
    encoder.onMesg(Profile.MesgNum.LAP, second);
  }
  for (let index = 0; index < (options.sessionCount ?? 1); index++)
    encoder.onMesg(Profile.MesgNum.SESSION, session);
  return Buffer.from(encoder.close());
}
