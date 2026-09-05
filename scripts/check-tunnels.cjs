const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Evaluate the service and pure form helpers without loading the native runtime.
function load(file, imports) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => imports[name] ?? {}, exports);
  return exports;
}
const requests = [];
let response = { ret: 0 };
const service = load('src/services/tunnels.ts', { '@/src/lib/lucky-fetch': {
  luckyFetch: async (url, options = {}) => {
    requests.push({ url, method: options.method ?? 'GET', body: options.body === undefined ? undefined : JSON.parse(options.body) });
    return response;
  },
} });
const form = load('src/components/tunnel-form.tsx', { '@/src/services/tunnels': service });
const last = () => requests.at(-1);
async function main() {
  for (const kind of ['stun', 'cloudflared', 'frp']) {
    const value = { Key: 'a/b', Name: 'Rule', Params: { Token: 'test' } };
    await service.saveTunnel(kind, value, false);
    assert.equal(last().url, kind === 'stun' ? '/api/stunrule' : `/api/${kind}/list`);
    assert.equal(last().method, 'POST');
    assert.deepEqual(last().body, value);
    await service.saveTunnel(kind, value, true);
    assert.equal(last().method, 'PUT');
    await service.enableTunnel(kind, 'a/b', false);
    assert.equal(last().url, kind === 'stun' ? '/api/stunrule/enable?key=a%2Fb&enable=false' : `/api/${kind}/list/a%2Fb/false`);
    await service.deleteTunnel(kind, 'a/b');
    assert.equal(last().method, 'DELETE');
    assert.equal(last().url, kind === 'stun' ? '/api/stunrule?key=a%2Fb' : `/api/${kind}/list/a%2Fb`);
    await service.reorderTunnels(kind, ['b', 'a']);
    assert.deepEqual(last().body, ['b', 'a']);
    response = { ret: 0, data: { list: [{ Key: 'a', Params: { Proxies: ['not-a-list'] } }] } };
    assert.equal((await service.listTunnels(kind)).items[0].Key, 'a');
    await service.getTunnelLastLogs(kind, 'a/b');
    assert.equal(last().url, `/api/${kind}/a%2Fb/lastlogs`);
    await service.getTunnelLogs(kind, 'a/b', 2);
    assert.equal(last().url, `/api/${kind}/a%2Fb/logs?pageSize=100&page=2`);
  }
  response = { instance: { Key: 'a', Params: { Token: 'test' }, proxies: [{ name: 'keep' }], visitors: [{ name: 'visitor' }] } };
  const instance = await service.getTunnel('frp', 'a');
  assert.deepEqual(instance.Proxies, [{ name: 'keep' }]);
  assert.deepEqual(instance.Visitors, [{ name: 'visitor' }]);
  assert.deepEqual(instance.Params, { Token: 'test' });
  for (const collection of ['proxies', 'visitors', 'ingress']) {
    const kind = collection === 'ingress' ? 'cloudflared' : 'frp';
    const previous = { name: 'old/a', hostname: 'a.example.com', path: '/old' };
    const value = { name: 'new', hostname: 'b.example.com', service: 'http://localhost:80' };
    await service.saveTunnelChild(kind, 'a/b', collection, value, previous);
    assert.equal(last().method, 'PUT');
    assert.equal(last().url, `/api/${kind}/a%2Fb/${collection}`);
    assert.deepEqual(last().body, collection === 'ingress'
      ? { oldHostname: 'a.example.com', oldPath: '/old', newRule: value }
      : collection === 'proxies' ? { oldName: 'old/a', newProxy: value } : { oldName: 'old/a', newVisitor: value });
    await service.deleteTunnelChild(kind, 'a/b', collection, previous);
    assert.equal(last().url, collection === 'ingress' ? '/api/cloudflared/a%2Fb/ingress?hostname=a.example.com&path=%2Fold' : `/api/frp/a%2Fb/${collection}/old%2Fa`);
  }
  await service.cloudflareDns('a', 'example.com', 'create');
  assert.deepEqual(last().body, { hostname: 'example.com', proxied: true });
  assert.throws(() => service.enableTunnel('frp', '', true), /标识/);
  assert.throws(() => service.tunnelItems({ ret: 0 }), /列表/);
  assert.deepEqual(service.tunnelItems({ ret: 0, list: null }), []);
  assert.deepEqual(service.tunnelLogLines({ logs: null }), []);
  assert.deepEqual(service.tunnelLogLines({ data: { logs: [{ LogTime: '12:00', LogContent: 'ready' }] } }), ['12:00 ready']);

  const stun = { ...form.tunnelDefaults('stun'), Name: 'test', ListenPort: '0', TargetPort: '8080' };
  const parsed = form.validateTunnelForm('stun', stun);
  assert.equal(parsed.ListenPort, 0);
  assert.equal(parsed.TargetPort, 8080);
  assert.throws(() => form.validateTunnelForm('stun', { ...stun, TargetPort: '99999' }), /范围/);
  assert.throws(() => form.validateTunnelForm('stun', { ...stun, TargetAddressList: [' '] }), /目标地址/);
  assert.doesNotThrow(() => form.validateTunnelForm('stun', { ...stun, StunTimeout: 0 }));
  assert.throws(() => form.validateTunnelForm('stun', { ...stun, DiaglogShowMode: 'diy', StunTimeout: 0 }), /STUN 超时/);
  assert.doesNotThrow(() => form.validateTunnelForm('stun', { ...stun, WebhookEnable: false, WebhookURL: '', WebhookMethod: '' }));
  assert.throws(() => form.validateTunnelForm('stun', { ...stun, WebhookEnable: true, WebhookURL: '', WebhookMethod: 'post' }), /Webhook 地址/);
  const simpleUpnp = form.updateTunnelFormValue('stun', { ...stun, NatPMP: true, AutoOptionsFirewall: true, DisablePortForward: true }, 'UPnP', true);
  assert.equal(simpleUpnp.UPnP, true);
  assert.equal(simpleUpnp.NatPMP, false);
  assert.equal(simpleUpnp.AutoOptionsFirewall, false);
  assert.equal(simpleUpnp.DisablePortForward, false);
  const diyUpnp = form.updateTunnelFormValue('stun', { ...stun, DiaglogShowMode: 'diy', NatPMP: true, AutoOptionsFirewall: true, DisablePortForward: true }, 'UPnP', true);
  assert.equal(diyUpnp.NatPMP, false);
  assert.equal(diyUpnp.AutoOptionsFirewall, true);
  assert.equal(diyUpnp.DisablePortForward, true);
  const simpleAddressOnly = form.updateTunnelFormValue('stun', { ...stun, UPnP: true, NatPMP: true, AutoOptionsFirewall: true }, 'DisablePortForward', true);
  assert.equal(simpleAddressOnly.UPnP, false);
  assert.equal(simpleAddressOnly.NatPMP, false);
  assert.equal(simpleAddressOnly.AutoOptionsFirewall, false);
  assert.throws(() => form.validateTunnelForm('cloudflared', form.tunnelDefaults('cloudflared')), /名称/);
  const frp = form.tunnelDefaults('frp');
  frp.Remark = 'test'; frp.Params.ServerAddr = '127.0.0.1'; frp.Params.Protocol = 'quic';
  frp.Proxies = [{ name: 'keep', plugin: 'socks5' }];
  const validFrp = form.validateTunnelForm('frp', frp);
  assert.equal(validFrp.Params.TCPMux, false);
  assert.deepEqual(validFrp.Proxies, frp.Proxies);
  console.log('Tunnel contracts, nested configuration, validation and log checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
