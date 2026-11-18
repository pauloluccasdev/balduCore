import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Decoder,
  Encoder,
  Profile,
  Stream,
  type FileIdMesg,
  type RecordMesg,
  type LapMesg,
  type SessionMesg,
} from '@garmin/fitsdk';

// Fixtures binárias geradas, exclusivamente sintéticas; nenhuma atividade de pessoa real.
function sampleActivity() {
  const start = new Date('2026-11-18T12:00:00.000Z');
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
  for (const record of records) encoder.onMesg(Profile.MesgNum.RECORD, record);
  encoder.onMesg(Profile.MesgNum.LAP, lap);
  encoder.onMesg(Profile.MesgNum.SESSION, session);
  return Buffer.from(encoder.close());
}

test('FIT SDK oficial: import ESM/tipos, integridade e leitura de sessão, splits e amostras em unidades do arquivo', () => {
  const bytes = sampleActivity();
  const decoder = new Decoder(Stream.fromBuffer(bytes));
  assert.equal(decoder.isFIT(), true);
  assert.equal(decoder.checkIntegrity(), true);
  const { messages, errors } = decoder.read({
    includeUnknownData: false,
    convertDateTimesToDates: true,
    applyScaleAndOffset: true,
  });
  assert.equal(errors.length, 0);
  assert.equal(messages.fileIdMesgs?.[0].type, 'activity');
  assert.equal(messages.sessionMesgs?.length, 1);
  const session = messages.sessionMesgs![0];
  assert.equal(session.sport, 'running');
  assert.equal(session.totalDistance, 90);
  assert.equal(session.totalTimerTime, 20);
  assert.equal(session.totalElapsedTime, 22);
  assert.ok(session.startTime instanceof Date);
  assert.equal(session.startTime.toISOString(), '2026-11-18T12:00:00.000Z');
  assert.equal(messages.lapMesgs?.length, 1);
  assert.equal(messages.lapMesgs![0].totalDistance, 90);
  assert.equal(messages.recordMesgs?.length, 3);
  assert.equal(messages.recordMesgs![0].speed, 0);
  assert.equal(messages.recordMesgs![1].speed, 4);
  assert.equal(messages.recordMesgs![1].heartRate, 150);
  assert.ok(messages.recordMesgs![2].heartRate == null);
  assert.ok(messages.recordMesgs![2].cadence == null);
});

test('FIT SDK oficial: CRC adulterado, arquivo truncado e assinatura inválida são identificados', () => {
  const bytes = sampleActivity();
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 0xff;
  const corrupted = new Decoder(Stream.fromBuffer(corrupt));
  assert.equal(corrupted.isFIT(), true);
  assert.equal(corrupted.checkIntegrity(), false);
  assert.equal(
    new Decoder(
      Stream.fromBuffer(bytes.subarray(0, bytes.length - 1)),
    ).checkIntegrity(),
    false,
  );
  const wrongSignature = Buffer.from(bytes);
  wrongSignature.write('NOPE', 8, 'ascii');
  assert.equal(Decoder.isFIT(Stream.fromBuffer(wrongSignature)), false);
});
