import { describe, it, expect } from 'vitest';
import { parse } from '../parser.js';

describe('parse', () => {
  it('parses @config section', () => {
    const ast = parse(`@config
  title: "Test Game"
  author: "Author"
  version: 1.0
  start: scene.main
  lang: zh`);
    expect(ast.config).toEqual({
      title: 'Test Game',
      author: 'Author',
      version: 1.0,
      start: 'scene.main',
      lang: 'zh',
    });
  });

  it('parses @define with characters', () => {
    const ast = parse(`@define
  char Hero:
    name: "Hero"
    portrait: assets/hero.png
    color: #a3cfff
    stats:
      hp: 100
      alive: true`);
    expect(ast.define).not.toBeNull();
    expect(ast.define!.chars.Hero).toEqual({
      name: 'Hero',
      portrait: 'assets/hero.png',
      color: '#a3cfff',
      voice: '',
      stats: { hp: 100, alive: true },
    });
  });

  it('parses @define with items', () => {
    const ast = parse(`@define
  item sword:
    name: "Sword"
    desc: "A sharp blade"
    icon: none
    stackable: false
    tags: [weapon, metal]`);
    expect(ast.define!.items.sword).toEqual({
      name: 'Sword',
      desc: 'A sharp blade',
      icon: 'none',
      stackable: false,
      tags: ['weapon', 'metal'],
    });
  });

  it('parses @define with variables', () => {
    const ast = parse(`@define
  var score: 0
  var name: "none"
  var flags: []`);
    expect(ast.define!.vars).toEqual({
      score: 0,
      name: 'none',
      flags: [],
    });
  });

  it('parses @scene with dialog and narration', () => {
    const ast = parse(`@scene intro
  :: Hello world.
  Hero :: I am here.
  Hero :: (whisper) Be quiet.`);
    expect(ast.scenes.intro).toBeDefined();
    const body = ast.scenes.intro.body;
    expect(body).toHaveLength(3);
    expect(body[0]).toEqual({ kind: 'narration', text: 'Hello world.', segments: [{ kind: 'text', content: 'Hello world.' }], modifiers: [] });
    expect(body[1]).toEqual({ kind: 'dialog', char: 'Hero', text: 'I am here.', segments: [{ kind: 'text', content: 'I am here.' }], modifiers: [], voice: undefined });
    expect(body[2]).toEqual({
      kind: 'dialog', char: 'Hero', text: 'Be quiet.',
      segments: [{ kind: 'text', content: 'Be quiet.' }],
      modifiers: [{ type: 'whisper', args: [] }],
      voice: undefined,
    });
  });

  it('parses choices with options and jumps', () => {
    const ast = parse(`@scene main
  ? "What do you do?"
    > "Go left"
      -> scene.left
    > "Go right"
      -> scene.right`);
    const body = ast.scenes.main.body;
    expect(body).toHaveLength(1);
    expect(body[0].kind).toBe('choice');
    const choice = body[0] as any;
    expect(choice.prompt).toBe('What do you do?');
    expect(choice.options).toHaveLength(2);
    expect(choice.options[0].text).toBe('Go left');
    expect(choice.options[0].target).toBe('scene.left');
    expect(choice.options[1].text).toBe('Go right');
    expect(choice.options[1].target).toBe('scene.right');
  });

  it('parses choices with conditions', () => {
    const ast = parse(`@scene main
  ? "Choose"
    > "Secret"
      [if Hero.stats.hp >= 50]
      -> scene.secret`);
    const choice = ast.scenes.main.body[0] as any;
    expect(choice.options[0].condition).toEqual({
      kind: 'binary',
      left: 'Hero.stats.hp',
      op: '>=',
      right: 50,
    });
  });

  it('parses inline actions', () => {
    const ast = parse(`@scene main
  [give item.keycard]
  [set Hero.stats.hp += 10]
  [add_flag "found_key"]
  [sfx door_open]
  [shake screen 0.4]`);
    const body = ast.scenes.main.body;
    expect(body).toHaveLength(5);
    expect(body[0]).toEqual({ kind: 'action', type: 'give', target: 'item.keycard' });
    expect(body[1]).toEqual({ kind: 'action', type: 'set', target: 'Hero.stats.hp', value: '+= 10' });
    expect(body[2]).toEqual({ kind: 'action', type: 'add_flag', target: 'found_key' });
    expect(body[3]).toEqual({ kind: 'action', type: 'sfx', target: 'door_open', args: [] });
    expect(body[4]).toEqual({ kind: 'action', type: 'shake', target: 'screen', args: ['0.4'] });
  });

  it('parses jump nodes', () => {
    const ast = parse(`@scene main
  -> scene.other`);
    expect(ast.scenes.main.body[0]).toEqual({ kind: 'jump', target: 'scene.other' });
  });

  it('parses wait nodes', () => {
    const ast = parse(`@scene main
  :: Before.
  ---
  :: After.`);
    expect(ast.scenes.main.body[1]).toEqual({ kind: 'wait' });
  });

  it('parses @logic section', () => {
    const ast = parse(`@logic check
  [set ending = "A"]
  -> scene.ending`);
    expect(ast.logic.check).toBeDefined();
    expect(ast.logic.check.body).toHaveLength(2);
  });

  it('parses multiple scenes', () => {
    const ast = parse(`@scene first
  :: First scene.
@scene second
  :: Second scene.`);
    expect(Object.keys(ast.scenes)).toEqual(['first', 'second']);
  });

  it('handles comments', () => {
    const ast = parse(`@scene main
  // This is a comment
  :: Hello.`);
    expect(ast.scenes.main.body).toHaveLength(1);
  });

  it('parses scene headers', () => {
    const ast = parse(`@scene intro
  bg: assets/bg.jpg
  music: bgm/music.ogg
  transition: fade 0.8
  :: Hello.`);
    expect(ast.scenes.intro.bg).toBe('assets/bg.jpg');
    expect(ast.scenes.intro.music).toBe('bgm/music.ogg');
    expect(ast.scenes.intro.transition).toBe('fade 0.8');
  });
});
