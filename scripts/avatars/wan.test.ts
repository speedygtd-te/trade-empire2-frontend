import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

import {
  WAN_CUTSCENE_OPTIONS,
  WAN_MAX_CONSECUTIVE_UNKNOWN,
  WAN_MODEL,
  WAN_REGION,
  buildWanRequestBody,
  frameToDataUrl,
  parseEnvFile,
  parseWanTaskResponse,
  pickEnvVar,
  pollWanTask,
  prepareFrameBuffer,
  readWanTaskId,
  stripEnvQuotes,
  wanEndpoints,
} from './utils';

const WORKSPACE = 'ws-testworkspace';

function taskResponse(status: string, extra: Record<string, unknown> = {}): unknown {
  return { request_id: 'rq-1', output: { task_id: 't-1', task_status: status, ...extra } };
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

describe('buildWanRequestBody', () => {
  it('sends duration as the integer 15, not a string', () => {
    const body = buildWanRequestBody('motion', 'data:image/jpeg;base64,AAA');
    expect(body.parameters.duration).toBe(15);
    expect(typeof body.parameters.duration).toBe('number');
    expect(Number.isInteger(body.parameters.duration)).toBe(true);
  });

  it('pins model, resolution, ratio and the first_frame media entry', () => {
    const body = buildWanRequestBody('motion', 'data:image/jpeg;base64,AAA');
    expect(body.model).toBe(WAN_MODEL);
    expect(body.parameters.resolution).toBe('720P');
    expect(body.parameters.ratio).toBe('9:16');
    expect(body.input.prompt).toBe('motion');
    expect(body.input.media).toEqual([
      { type: 'first_frame', url: 'data:image/jpeg;base64,AAA' },
    ]);
  });

  it('sets audio, prompt_extend and watermark explicitly instead of inheriting defaults', () => {
    const body = buildWanRequestBody('motion', 'url');
    expect(body.parameters.audio).toBe(false);
    expect(body.parameters.prompt_extend).toBe(true);
    expect(body.parameters.watermark).toBe(false);
    expect(Object.keys(body.parameters)).toContain('watermark');
  });

  it('honours overridden options', () => {
    const body = buildWanRequestBody('motion', 'url', {
      ...WAN_CUTSCENE_OPTIONS,
      duration: 5,
      promptExtend: false,
      watermark: true,
    });
    expect(body.parameters.duration).toBe(5);
    expect(body.parameters.prompt_extend).toBe(false);
    expect(body.parameters.watermark).toBe(true);
    // audio stays off regardless — the app owns the audio layer.
    expect(body.parameters.audio).toBe(false);
  });

  it('inlines the frame as a jpeg data URL', () => {
    expect(frameToDataUrl(Buffer.from([0xff, 0xd8]))).toBe('data:image/jpeg;base64,/9g=');
  });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

describe('wanEndpoints', () => {
  it('composes create and task URLs from workspace id and region', () => {
    const e = wanEndpoints(WORKSPACE);
    expect(e.create).toBe(
      `https://${WORKSPACE}.${WAN_REGION}.maas.aliyuncs.com` +
        '/api/v1/services/aigc/video-generation/video-synthesis',
    );
    expect(e.task('task-42')).toBe(
      `https://${WORKSPACE}.${WAN_REGION}.maas.aliyuncs.com/api/v1/tasks/task-42`,
    );
  });

  it('accepts an explicit region', () => {
    expect(wanEndpoints(WORKSPACE, 'cn-beijing').create).toContain(
      `${WORKSPACE}.cn-beijing.maas.aliyuncs.com`,
    );
  });

  it('refuses to build an endpoint without a workspace id', () => {
    expect(() => wanEndpoints('')).toThrow(/WAN_WORKSPACE_ID/);
  });

  it('refuses to build an endpoint without a region', () => {
    expect(() => wanEndpoints(WORKSPACE, '')).toThrow(/region/i);
  });
});

// ---------------------------------------------------------------------------
// Task response parsing
// ---------------------------------------------------------------------------

describe('parseWanTaskResponse', () => {
  it('returns the video URL on SUCCEEDED', () => {
    const d = parseWanTaskResponse(taskResponse('SUCCEEDED', { video_url: 'https://x/v.mp4' }));
    expect(d).toEqual({ kind: 'done', videoUrl: 'https://x/v.mp4' });
  });

  it('treats SUCCEEDED without video_url as a failure, not a success', () => {
    const d = parseWanTaskResponse(taskResponse('SUCCEEDED'));
    expect(d.kind).toBe('failed');
    if (d.kind === 'failed') expect(d.message).toMatch(/video_url/);
  });

  it('fails on FAILED and surfaces the server message', () => {
    const d = parseWanTaskResponse(
      taskResponse('FAILED', { code: 'InvalidParameter', message: 'bad ratio' }),
    );
    expect(d.kind).toBe('failed');
    if (d.kind === 'failed') {
      expect(d.message).toContain('InvalidParameter');
      expect(d.message).toContain('bad ratio');
    }
  });

  it('fails on CANCELED', () => {
    expect(parseWanTaskResponse(taskResponse('CANCELED')).kind).toBe('failed');
  });

  it('keeps polling on PENDING and RUNNING', () => {
    expect(parseWanTaskResponse(taskResponse('PENDING'))).toEqual({
      kind: 'pending',
      status: 'PENDING',
    });
    expect(parseWanTaskResponse(taskResponse('RUNNING'))).toEqual({
      kind: 'pending',
      status: 'RUNNING',
    });
  });

  it('reports UNKNOWN separately so the caller can count it', () => {
    expect(parseWanTaskResponse(taskResponse('UNKNOWN'))).toEqual({ kind: 'unknown' });
  });

  it('fails when the response carries no output object', () => {
    expect(parseWanTaskResponse({ request_id: 'x' }).kind).toBe('failed');
    expect(parseWanTaskResponse(null).kind).toBe('failed');
  });
});

describe('readWanTaskId', () => {
  it('extracts output.task_id', () => {
    expect(readWanTaskId(taskResponse('PENDING'))).toBe('t-1');
  });

  it('throws when the create response has no task id', () => {
    expect(() => readWanTaskId({ output: {} })).toThrow(/task_id/);
  });
});

// ---------------------------------------------------------------------------
// Poll loop (injected fetch/sleep doubles — no network, no real waiting)
// ---------------------------------------------------------------------------

describe('pollWanTask', () => {
  function deps(responses: unknown[]): {
    fetchTask: () => Promise<unknown>;
    sleep: (ms: number) => Promise<void>;
    slept: number[];
    calls: () => number;
  } {
    let i = 0;
    const slept: number[] = [];
    return {
      fetchTask: () => Promise.resolve(responses[Math.min(i++, responses.length - 1)]),
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
      slept,
      calls: () => i,
    };
  }

  it('resolves with the video URL once the task succeeds', async () => {
    const d = deps([
      taskResponse('PENDING'),
      taskResponse('RUNNING'),
      taskResponse('SUCCEEDED', { video_url: 'https://x/v.mp4' }),
    ]);
    await expect(pollWanTask('t-1', d, 10, 15000)).resolves.toBe('https://x/v.mp4');
    expect(d.slept).toEqual([15000, 15000, 15000]);
  });

  it('gives up after 4 consecutive UNKNOWN instead of polling the full budget', async () => {
    const d = deps([taskResponse('UNKNOWN')]);
    await expect(pollWanTask('t-1', d, 80, 15000)).rejects.toThrow(/UNKNOWN/);
    expect(d.calls()).toBe(WAN_MAX_CONSECUTIVE_UNKNOWN);
  });

  it('resets the UNKNOWN counter on any other status', async () => {
    const d = deps([
      taskResponse('UNKNOWN'),
      taskResponse('UNKNOWN'),
      taskResponse('UNKNOWN'),
      taskResponse('RUNNING'),
      taskResponse('UNKNOWN'),
      taskResponse('SUCCEEDED', { video_url: 'https://x/v.mp4' }),
    ]);
    await expect(pollWanTask('t-1', d, 80, 1)).resolves.toBe('https://x/v.mp4');
  });

  it('propagates a terminal failure immediately', async () => {
    const d = deps([taskResponse('FAILED', { message: 'nope' })]);
    await expect(pollWanTask('t-1', d, 80, 1)).rejects.toThrow(/nope/);
    expect(d.calls()).toBe(1);
  });

  it('times out after maxAttempts polls', async () => {
    const d = deps([taskResponse('RUNNING')]);
    await expect(pollWanTask('t-1', d, 3, 15000)).rejects.toThrow(/unfinished after 3 polls/);
    expect(d.calls()).toBe(3);
  });

  it('reports each tick to the caller', async () => {
    const ticks: string[] = [];
    const d = deps([
      taskResponse('RUNNING'),
      taskResponse('SUCCEEDED', { video_url: 'u' }),
    ]);
    await pollWanTask('t-1', { ...d, onTick: (s) => ticks.push(s) }, 10, 1);
    expect(ticks).toEqual(['RUNNING']);
  });
});

// ---------------------------------------------------------------------------
// Frame preparation
// ---------------------------------------------------------------------------

describe('prepareFrameBuffer', () => {
  async function makeComposite(): Promise<Buffer> {
    const bg = await sharp({
      create: {
        width: 96,
        height: 160,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const overlay = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 4,
        background: { r: 200, g: 40, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    return sharp(bg).composite([{ input: overlay, left: 10, top: 10 }]).png().toBuffer();
  }

  it('produces an opaque JPEG — WAN rejects a transparent channel', async () => {
    const composite = await makeComposite();
    const before = await sharp(composite).metadata();
    expect(before.hasAlpha).toBe(true);

    const frame = await prepareFrameBuffer(composite);
    const after = await sharp(frame).metadata();
    expect(after.format).toBe('jpeg');
    expect(after.hasAlpha).toBe(false);
  });

  it('keeps the composite dimensions', async () => {
    const frame = await prepareFrameBuffer(await makeComposite());
    const meta = await sharp(frame).metadata();
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(160);
  });

  it('shrinks the payload compared to the RGBA PNG composite', async () => {
    const composite = await makeComposite();
    const frame = await prepareFrameBuffer(composite);
    expect(frame.length).toBeGreaterThan(0);
    expect(frame.length).toBeLessThan(composite.length * 4);
  });
});

// ---------------------------------------------------------------------------
// Key / env parsing
// ---------------------------------------------------------------------------

describe('env parsing', () => {
  it('strips wrapping double and single quotes', () => {
    expect(stripEnvQuotes('"secret"')).toBe('secret');
    expect(stripEnvQuotes("'secret'")).toBe('secret');
    expect(stripEnvQuotes('  "secret"  ')).toBe('secret');
    expect(stripEnvQuotes('secret')).toBe('secret');
  });

  it('leaves inner quotes and lone quote characters alone', () => {
    expect(stripEnvQuotes('"a"b"')).toBe('a"b');
    expect(stripEnvQuotes('"')).toBe('"');
  });

  it('parses a quoted dotenv file without leaking the quote into the value', () => {
    const vars = parseEnvFile(
      ['# comment', 'FAL_AI_API_KEY="abc:def"', '', 'WAN_API_KEY="xyz"', 'WAN_WORKSPACE_ID=ws-1'].join(
        '\n',
      ),
    );
    expect(vars).toEqual({
      FAL_AI_API_KEY: 'abc:def',
      WAN_API_KEY: 'xyz',
      WAN_WORKSPACE_ID: 'ws-1',
    });
  });

  it('handles CRLF files and values containing "="', () => {
    const vars = parseEnvFile('A="p=q"\r\nB=r\r\n');
    expect(vars).toEqual({ A: 'p=q', B: 'r' });
  });

  it('accepts both fal key spellings, preferring FAL_AI_API_KEY', () => {
    expect(pickEnvVar({ FAL_AI_API_KEY: 'new', FAL_API_KEY: 'old' }, ['FAL_AI_API_KEY', 'FAL_API_KEY'])).toBe('new');
    expect(pickEnvVar({ FAL_API_KEY: 'old' }, ['FAL_AI_API_KEY', 'FAL_API_KEY'])).toBe('old');
    expect(pickEnvVar({}, ['FAL_AI_API_KEY', 'FAL_API_KEY'])).toBeUndefined();
  });

  it('lets process.env override the file and de-quotes it too', () => {
    process.env.WAN_TEST_KEY = '"from-shell"';
    try {
      expect(pickEnvVar({ WAN_TEST_KEY: 'from-file' }, ['WAN_TEST_KEY'])).toBe('from-shell');
    } finally {
      delete process.env.WAN_TEST_KEY;
    }
  });
});
