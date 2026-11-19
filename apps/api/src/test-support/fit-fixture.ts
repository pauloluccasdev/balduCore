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
    recordCount?: number;
    sessionCount?: number;
    order?: 'reversed' | 'untimed';
  } = {},
) {
  const end = new Date(start.getTime() + 20_000);
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
  for (let index = 0; index < (options.sessionCount ?? 1); index++)
    encoder.onMesg(Profile.MesgNum.SESSION, session);
  return Buffer.from(encoder.close());
}
