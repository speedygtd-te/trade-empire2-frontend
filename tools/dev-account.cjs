// A fixed development account on the server, for looking at real answers and for the scene
// tools. Credentials live in .local/dev-account.json (ignored by git), created on first use.
//
//   node tools/dev-account.cjs [server] [path ...]      prints the JSON answers of GET <path>
//   node tools/dev-account.cjs https://trade-empire.net /v2/me /v2/structures
//
// NDJSON answers (layout, surface) are printed line by line, long lines shortened.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, '.local', 'dev-account.json');

async function call(server, method, route, body, token) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(server + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, type: response.headers.get('content-type') || '', text: await response.text() };
}

async function signIn(server) {
  let account = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
  if (account && account.server === server && account.token) {
    const me = await call(server, 'GET', '/v2/me', null, account.token);
    if (me.status === 200) return account;
  }
  if (!account || account.server !== server) {
    const stamp = Date.now() % 100000000;
    account = {
      server,
      email: `dev${stamp}@example.test`,
      password: 'Dev-' + crypto.randomBytes(9).toString('hex'),
      playerName: `Dev${stamp}`,
    };
    const created = await call(server, 'POST', '/v2/auth/register',
      { email: account.email, password: account.password, playerName: account.playerName });
    if (created.status !== 201 && created.status !== 200) throw new Error(`register: ${created.status} ${created.text}`);
    account.token = JSON.parse(created.text).token;
  } else {
    const login = await call(server, 'POST', '/v2/auth/login', { email: account.email, password: account.password });
    if (login.status === 401 || login.status === 400) {
      // The account is gone (world reset): found it again with the same credentials.
      const created = await call(server, 'POST', '/v2/auth/register',
        { email: account.email, password: account.password, playerName: account.playerName });
      if (created.status !== 201 && created.status !== 200) throw new Error(`register after reset: ${created.status} ${created.text}`);
      account.token = JSON.parse(created.text).token;
      console.log('# account was gone (world reset?) and has been created again');
    } else if (login.status !== 200) {
      throw new Error(`login: ${login.status} ${login.text}`);
    } else {
      account.token = JSON.parse(login.text).token;
    }
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(account, null, 2));
  return account;
}

async function main() {
  const args = process.argv.slice(2);
  const server = args[0] && args[0].startsWith('http') ? args.shift() : 'https://trade-empire.net';
  const account = await signIn(server);
  console.log(`# account ${account.playerName} on ${server}`);
  for (const route of args) {
    const answer = await call(server, 'GET', route, null, account.token);
    console.log(`# GET ${route} -> ${answer.status} (${answer.type}, ${answer.text.length} bytes)`);
    if (answer.type.includes('ndjson')) {
      for (const line of answer.text.split('\n').filter(Boolean)) console.log(line.length > 600 ? line.slice(0, 600) + ' …' : line);
    } else {
      console.log(answer.text.length > 4000 ? answer.text.slice(0, 4000) + ' …' : answer.text);
    }
  }
}

main().catch((error) => { console.error('FAILED ' + error.message); process.exit(1); });
