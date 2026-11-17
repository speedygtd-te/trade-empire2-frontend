/**
 * EXPERIMENT HELPER — read the live status of one WAN task id.
 *
 * Companion to wan-story-2seg.ts. Lets a already-paid-for task be inspected
 * (or its video_url recovered) without starting a second render. Never prints
 * the API key.
 *
 * Usage: npx tsx scripts/avatars/wan-task-status.ts <taskId> [--url]
 */
import * as https from 'https';
import { loadWanCredentials, wanEndpoints } from './utils.js';

const taskId = process.argv[2];
const showUrl = process.argv.includes('--url');
if (!taskId) {
  console.error('Usage: npx tsx scripts/avatars/wan-task-status.ts <taskId> [--url]');
  process.exit(1);
}

const wan = loadWanCredentials();
const u = new URL(wanEndpoints(wan.workspaceId).task(taskId));

https
  .get(
    { hostname: u.hostname, path: u.pathname, headers: { Authorization: `Bearer ${wan.apiKey}` } },
    (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 300) {
          console.error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`);
          process.exit(1);
        }
        const o = (JSON.parse(text).output ?? {}) as Record<string, unknown>;
        console.log(`task:      ${taskId}`);
        console.log(`status:    ${o.task_status ?? '?'}`);
        console.log(`submit:    ${o.submit_time ?? '-'}`);
        console.log(`scheduled: ${o.scheduled_time ?? '-'}`);
        console.log(`end:       ${o.end_time ?? '-'}`);
        console.log(`video_url: ${o.video_url ? 'present' : 'none'}`);
        if (o.message) console.log(`message:   ${String(o.message).slice(0, 300)}`);
        if (showUrl && o.video_url) console.log(`url:       ${String(o.video_url)}`);
      });
    },
  )
  .on('error', (e) => {
    console.error(e.message);
    process.exit(1);
  });
