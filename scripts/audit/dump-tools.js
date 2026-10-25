const C = require('../../audio-tools.config.js');
for (const id of ['metronome', 'mic-check', 'stereo-test']) {
  const t = C.getTool(id);
  console.log(JSON.stringify({
    id: t.id, slug: t.slug, name: t.name, status: t.status, engine: t.engine,
    handler: t.handler, requiresFile: t.requiresFile, action: t.action,
    options: t.options, limitations: t.limitations
  }, null, 2));
}
