import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise rendered copy/controls with invented input; no browser, API or model.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const suffix of ['.tsx', '.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (/\.tsx?$/.test(url)) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { default: PlanAdjustment } = await import('../components/PlanAdjustment.tsx');
const { default: GenerationProgress } = await import('../components/GenerationProgress.tsx');
const { currentPlannerFixture } = await import('./planner-fixture.mjs');
const { input, output } = currentPlannerFixture('2026-11-23');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const clarification = decision => ({ ...output, outcome: 'needs_clarification', sessions: [], questions: ['Add more context.'], assessment: {
  decision, reason: 'The saved result is older than the proposed training window.', actions: ['benchmark'],
} });
test('a stale-result clarification has one clear action and no target comparison', () => {
  const html = render(PlanAdjustment, { output: clarification('refresh_benchmark'), input, today: '2026-11-23', onEdit() {} });
  assert.match(html, /Add a more recent result/);
  assert.match(html, /No workouts were created\. Your draft and target are saved\./);
  assert.equal((html.match(/Update recent result/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Your target|Past race time|faster than|Target time needs adjustment/);
  assert.match(html, /<details[^>]*>[\s\S]*The saved result is older/);
});
test('a supported goal suggestion still requires an explicit Use target action', () => {
  const result = clarification('adjust_goal');
  result.assessment.actions = ['target_time'];
  result.assessment.suggestions = { finishTime: { durationSeconds: 2400, reason: 'Synthetic training estimate.' }, schedule: null };
  const html = render(PlanAdjustment, { output: result, input, today: '2026-11-23', onApply() {}, onEdit() {} });
  assert.match(html, /Suggested target/);
  assert.match(html, /Use 0:40:00 target/);
  assert.match(html, /Edit target manually/);
  assert.doesNotMatch(html, /Update recent result/);
});
test('generation loading exposes an accessible status without a fake percentage', () => {
  for (const props of [{}, { sample: true }, { resumed: true }]) {
    const html = render(GenerationProgress, props);
    assert.match(html, /role="status"/);
    assert.match(html, /journey-runner\.webp/);
    assert.doesNotMatch(html, /[0-9]+%|aria-valuenow/);
  }
  assert.match(render(GenerationProgress, { sample: true }), /Preparing your sample schedule/);
  assert.match(render(GenerationProgress, { resumed: true }), /request is already running/);
});
