import { describe, it, expect } from 'vitest';
import { parse } from '../parser.js';
import { createRuntime } from '../runtime.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('demo script (deep-sea.kni)', () => {
  const content = readFileSync(resolve(__dirname, '../../../../examples/deep-sea.kni'), 'utf-8');

  it('parses the demo script', () => {
    const ast = parse(content);
    expect(ast.config).toBeDefined();
    expect(ast.config!.title).toBe('深海遗迹');
    expect(ast.define).toBeDefined();
    expect(Object.keys(ast.define!.chars)).toEqual(['Aria', 'Narrator']);
    expect(Object.keys(ast.define!.items)).toEqual(['keycard']);
    expect(ast.define!.vars.chapter).toBe(1);
    expect(Object.keys(ast.scenes)).toEqual([
      'intro', 'look_around', 'enter_hatch', 'underground', 'check_end', 'retreat', 'ending_A', 'ending_B', 'ending_C'
    ]);
    expect(Object.keys(ast.logic)).toEqual(['check_endings']);
  });

  it('runs the intro scene and presents a choice', () => {
    const ast = parse(content);
    const rt = createRuntime(ast);
    const events = rt.start();

    // Should have narration, dialog, and a choice
    const narrations = events.filter(e => e.kind === 'NARRATION');
    const dialogs = events.filter(e => e.kind === 'DIALOG');
    const choices = events.filter(e => e.kind === 'CHOICE');

    expect(narrations.length).toBeGreaterThan(0);
    expect(dialogs.length).toBeGreaterThan(0);
    expect(choices).toHaveLength(1);

    const choice = choices[0] as any;
    expect(choice.options).toHaveLength(3);
    expect(rt.hasPendingChoice()).toBe(true);
  });

  it('can select "先环顾四周" and follow the path', () => {
    const ast = parse(content);
    const rt = createRuntime(ast);
    rt.start();

    // Select option 1: "先环顾四周"
    const events = rt.selectOption(1);
    expect(events).not.toBeNull();

    // Should get items and flags
    expect(rt.getState().inventory.has('keycard')).toBe(true);
    expect(rt.getState().flags).toContain('saw_mural');

    // Should end up in a scene with more narration
    const narrations = events!.filter(e => e.kind === 'NARRATION');
    expect(narrations.length).toBeGreaterThan(0);
  });

  it('can select "推开舱门" directly', () => {
    const ast = parse(content);
    const rt = createRuntime(ast);
    rt.start();

    // Select option 0: "推开舱门"
    const events = rt.selectOption(0);
    expect(events).not.toBeNull();

    // Should have trust increased
    expect(rt.getState().vars['Aria.stats.trust']).toBe(5);
  });

  it('logic check_endings evaluates conditions', () => {
    const ast = parse(content);
    const rt = createRuntime(ast);

    // Simulate: trust=5, saw_mural flag set
    const state = rt.getState();
    state.vars['Aria.stats.trust'] = 5;
    state.flags.push('saw_mural');

    const events = rt.enterLogic('check_endings');
    expect(events).not.toBeNull();
    expect(state.vars.ending).toBe('A');
  });
});
