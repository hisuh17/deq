const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
function page(responder = async () => ({ ok: true, json: async () => 'saved' })) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.test/deq/', runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [];
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.fetch = async (url, options) => { calls.push({url, ...options, payload: JSON.parse(options.body)}); return responder(url, options, calls.length); };
  for (const file of ['config.js', 'questions.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const $ = s => w.document.querySelector(s);
  const click = s => $(s).click();
  const check = (s, value) => { $(s).checked = value; $(s).dispatchEvent(new w.Event('change', {bubbles:true})); };
  function begin(consent) { click('#start-button'); check('#eligibility', true); check('#data-consent', consent); click('#intro-continue'); }
  function answer(value) { check(`#response-options input[value="${value}"]`, true); click('#question-next'); }
  return { dom, w, $, click, check, begin, answer, calls };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let p = page();
  assert.equal(p.$('#data-consent').checked, false);
  p.click('#start-button');
  assert.equal(p.$('#intro-continue').disabled, true);
  p.begin(false);
  p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown', {key:' '}));
  assert.equal(p.$('#question-next').disabled, true, 'Space must not select answer 0');
  for (let i=0;i<19;i++) p.answer(i%6);
  assert.equal(p.$('#total-score').textContent, '45');
  assert.equal(p.calls.length, 0, 'No consent = no transmission');
  assert.equal(p.$('#result-screen').hidden, false);
  p.dom.window.close();

  p = page(); p.begin(true); p.answer(2);
  p.click('#change-consent'); p.check('#data-consent', false); p.click('#intro-continue');
  assert.match(p.$('#progress-label').textContent, /Question 2 /);
  for(let i=1;i<19;i++) p.answer(2);
  assert.equal(p.calls.length, 0, 'Withdrawal before completion = no transmission');
  p.dom.window.close();

  let finish;
  p = page(() => new Promise(resolve => { finish = resolve; })); p.begin(true);
  for(let i=0;i<18;i++) p.answer(3);
  assert.equal(p.calls.length, 0, 'Partial answers must stay local');
  assert.equal(p.$('#question-next').textContent, 'Save & see results');
  p.answer(3);
  assert.equal(p.calls.length, 1);
  assert.equal(p.$('#start-over').disabled, true);
  assert.equal(p.$('#edit-answers').disabled, true);
  const sent = p.calls[0].payload;
  assert.deepEqual(sent.answer_values, Array(19).fill(3));
  assert.equal(sent.explicit_consent, true);
  assert.equal(sent.consent_version, '2026-09-17-v2');
  assert.match(sent.deletion_code, /^[a-f0-9]{64}$/);
  assert.equal(p.calls[0].credentials, 'omit');
  finish({ok:true, json:async()=>'saved'}); await tick();
  assert.equal(p.$('#storage-title').textContent, 'Your response is saved.');
  assert.equal(p.$('#receipt-code').value, sent.deletion_code);
  assert.equal(p.w.localStorage.length, 0);
  p.click('#start-over'); p.begin(false);
  for(let i=0;i<19;i++) p.answer(0);
  assert.equal(p.calls.length, 1, 'Restart must clear prior saving consent');
  p.dom.window.close();

  p = page(async(url,opts,n) => { if(n===1) throw new Error('network'); return {ok:true,json:async()=>url.includes('delete_')?'deleted':'saved'}; });
  p.begin(true); for(let i=0;i<19;i++) p.answer(1); await tick();
  assert.equal(p.$('#submit-answers').hidden, false);
  assert.equal(p.$('#deletion-receipt').hidden, false, 'Receipt needed for uncertain delivery');
  p.click('#submit-answers'); await tick();
  assert.equal(p.calls.length, 2);
  assert.deepEqual(p.calls[0].payload, p.calls[1].payload, 'Retry must reuse identical payload and code');
  p.click('#delete-current'); p.click('#delete-response'); await tick();
  assert.equal(p.$('#storage-title').textContent, 'Your saved response has been deleted.');
  assert.deepEqual(p.calls[2].payload, {deletion_code:p.calls[0].payload.deletion_code});
  assert.equal(p.$('#data-consent').checked, false);
  p.dom.window.close();
  console.log('PASS: optional upfront consent, eligibility gate, 19-answer completion, revocation, no partial/opt-out requests, saved payload, in-flight controls, receipt, reset, idempotent retry, deletion UI, no browser storage.');
})().catch(err=>{console.error(err);process.exitCode=1;});
