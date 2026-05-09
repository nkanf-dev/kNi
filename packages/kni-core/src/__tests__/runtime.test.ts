import { describe, it, expect } from 'vitest';
import { parse } from '../parser.js';
import { createRuntime } from '../runtime.js';

describe('createRuntime', () => {
  function makeRuntime(src: string) {
    return createRuntime(parse(src));
  }

  it('runs a simple linear scene', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  :: Hello.
  Hero :: Hi there.
  :: Goodbye.`);
    const events = rt.start();
    const kinds = events.map(e => e.kind);
    expect(kinds).toEqual(['NARRATION', 'DIALOG', 'NARRATION', 'END']);
  });

  it('handles narration text', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  :: Some narration text.`);
    const events = rt.start();
    expect(events[0]).toMatchObject({ kind: 'NARRATION', text: 'Some narration text.' });
  });

  it('handles dialog with character info', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@define
  char Aria:
    name: "Aria"
    color: #a3cfff
@scene main
  Aria :: Hello!`);
    const events = rt.start();
    expect(events[0]).toMatchObject({
      kind: 'DIALOG',
      char: 'Aria',
      charName: 'Aria',
      text: 'Hello!',
      color: '#a3cfff',
    });
  });

  it('handles wait nodes', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  :: Before.
  ---
  :: After.`);
    const events = rt.start();
    expect(events.map(e => e.kind)).toEqual(['NARRATION', 'WAIT', 'NARRATION', 'END']);
  });

  it('handles give/remove item actions', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  [give item.keycard]
  :: Got it.
  [remove item.keycard]
  :: Gone.`);
    const events = rt.start();
    expect(events[0]).toMatchObject({ kind: 'ACTION', type: 'give', target: 'item.keycard' });
    expect(events[2]).toMatchObject({ kind: 'ACTION', type: 'remove', target: 'item.keycard' });
    expect(rt.getState().inventory.has('keycard')).toBe(false);
  });

  it('handles set variable actions', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@define
  var score: 0
@scene main
  [set score = 10]
  [set score += 5]`);
    const events = rt.start();
    expect(rt.getState().vars.score).toBe(15);
  });

  it('handles add_flag/del_flag', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  [add_flag "found_key"]
  :: Flagged.
  [del_flag "found_key"]
  :: Unflagged.`);
    rt.start();
    expect(rt.getState().flags).not.toContain('found_key');
  });

  it('presents choices and handles selection', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  ? "Choose:"
    > "Option A"
      -> scene.a
    > "Option B"
      -> scene.b
@scene a
  :: You chose A.
@scene b
  :: You chose B.`);
    const events = rt.start();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('CHOICE');
    const choice = events[0] as any;
    expect(choice.options).toHaveLength(2);
    expect(choice.options[0].text).toBe('Option A');
    expect(choice.options[1].text).toBe('Option B');

    // Select option A
    const afterChoice = rt.selectOption(0);
    expect(afterChoice).not.toBeNull();
    const narrations = afterChoice!.filter(e => e.kind === 'NARRATION');
    expect(narrations[0]).toMatchObject({ text: 'You chose A.' });
  });

  it('handles choice with conditions', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@define
  var score: 5
@scene main
  ? "Choose:"
    > "Easy"
      -> scene.a
    > "Hard"
      [if score >= 10]
      -> scene.b
@scene a
  :: Easy path.
@scene b
  :: Hard path.`);
    const events = rt.start();
    const choice = events[0] as any;
    expect(choice.options[0].enabled).toBe(true);
    expect(choice.options[1].enabled).toBe(false);
  });

  it('handles choice with inline actions', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  ? "Choose:"
    > "Get item"
      [give item.keycard]
      -> scene.a
@scene a
  :: Done.`);
    rt.start();
    const events = rt.selectOption(0);
    expect(events![0]).toMatchObject({ kind: 'ACTION', type: 'give', target: 'item.keycard' });
    expect(rt.getState().inventory.has('keycard')).toBe(true);
  });

  it('handles jump nodes', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  :: Before jump.
  -> scene.other
@scene other
  :: After jump.`);
    const events = rt.start();
    const narrations = events.filter(e => e.kind === 'NARRATION');
    expect(narrations.map(n => (n as any).text)).toEqual(['Before jump.', 'After jump.']);
  });

  it('handles choice without target (continue)', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  ? "Choose:"
    > "Continue"
  :: After choice.`);
    const events = rt.start();
    expect(events[0].kind).toBe('CHOICE');
    const after = rt.selectOption(0);
    expect(after).not.toBeNull();
    expect(after!.some(e => e.kind === 'NARRATION' && (e as any).text === 'After choice.')).toBe(true);
  });

  it('handles character stats', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@define
  char Hero:
    name: "Hero"
    stats:
      hp: 100
@scene main
  [set Hero.stats.hp -= 20]
  Hero :: Ouch.`);
    rt.start();
    expect(rt.getState().vars['Hero.stats.hp']).toBe(80);
  });

  it('reports error for missing scene', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.missing`);
    const events = rt.start();
    expect(events.some(e => e.kind === 'ERROR')).toBe(true);
  });

  it('reports end at scene completion', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  :: The end.`);
    const events = rt.start();
    expect(events[events.length - 1].kind).toBe('END');
  });

  it('hasPendingChoice works correctly', () => {
    const rt = makeRuntime(`@config
  title: Test
  start: scene.main
@scene main
  ? "Choose:"
    > "A"
      -> scene.a
@scene a
  :: Done.`);
    expect(rt.hasPendingChoice()).toBe(false);
    rt.start();
    expect(rt.hasPendingChoice()).toBe(true);
    rt.selectOption(0);
    expect(rt.hasPendingChoice()).toBe(false);
  });
});
