// ── kNi DSL Type System ──
// Designed for migration compatibility with RenPy, KiriKiri/KAG, and A-sha engines.

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

export interface KniConfig {
  title: string;
  author: string;
  version: number;
  start: string;            // e.g. "scene.intro"
  lang: string;
}

// ──────────────────────────────────────────────
// Characters
// ──────────────────────────────────────────────

export interface CharStats {
  [key: string]: number | boolean | string;
}

export interface CharDef {
  name: string;
  portrait: string;
  color: string;
  voice: string;
  stats: CharStats;
}

// ──────────────────────────────────────────────
// Items
// ──────────────────────────────────────────────

export interface ItemDef {
  name: string;
  desc: string;
  icon: string;
  stackable: boolean;
  tags: string[];
}

// ──────────────────────────────────────────────
// Variables
// ──────────────────────────────────────────────

export interface VarDef {
  [name: string]: number | string | boolean | string[];
}

// ──────────────────────────────────────────────
// Define block
// ──────────────────────────────────────────────

export interface DefineBlock {
  chars: Record<string, CharDef>;
  items: Record<string, ItemDef>;
  vars: VarDef;
  persistVars: VarDef;      // Cross-playthrough persistent variables
}

// ──────────────────────────────────────────────
// Performance modifiers
// ──────────────────────────────────────────────

export interface Modifier {
  type: string;             // shake, flash, whisper, delay, etc.
  args: string[];
}

// ──────────────────────────────────────────────
// Text Segments — inline markup in dialog/narration
// ──────────────────────────────────────────────

export type TextSegment =
  | { kind: 'text'; content: string }
  | { kind: 'ruby'; base: string; annotation: string }        // furigana
  | { kind: 'style'; tag: TextStyleTag; children: TextSegment[] }
  | { kind: 'speed'; speed: number; children: TextSegment[] }
  | { kind: 'color'; color: string; children: TextSegment[] }
  | { kind: 'wait'; duration: number };                         // inline pause

export type TextStyleTag = 'b' | 'i' | 'u' | 's';

// ──────────────────────────────────────────────
// Layers & Sprites — RenPy/KiriKiri layer model
// ──────────────────────────────────────────────

export type SpritePosition = 'left' | 'center' | 'right' | 'far_left' | 'far_right' | { x: number; y: number };
export type TransitionType = 'none' | 'fade' | 'dissolve' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'wipe' | 'blinds' | 'pixelate';

export interface TransitionDef {
  type: TransitionType;
  duration: number;         // seconds
}

// ──────────────────────────────────────────────
// Audio — multi-channel audio system
// ──────────────────────────────────────────────

export type AudioChannel = 'bgm' | 'se' | 'voice';
export type AudioAction = 'play' | 'stop' | 'pause' | 'resume' | 'crossfade' | 'volume';

// ──────────────────────────────────────────────
// AST Nodes
// ──────────────────────────────────────────────

export type ASTNode =
  | DialogNode
  | NarrationNode
  | ChoiceNode
  | OptionNode
  | JumpNode
  | ActionNode
  | WaitNode
  | LabelNode
  | ReturnNode
  | ConditionalNode;

export interface DialogNode {
  kind: "dialog";
  char: string;
  text: string;
  segments: TextSegment[];    // parsed inline markup (empty = plain text)
  modifiers: Modifier[];
  voice?: string;             // per-line voice file
}

export interface NarrationNode {
  kind: "narration";
  text: string;
  segments: TextSegment[];
  modifiers: Modifier[];
}

export interface ChoiceNode {
  kind: "choice";
  prompt: string | null;
  options: OptionNode[];
  timed?: number;             // optional timeout in seconds
}

export interface OptionNode {
  kind: "option";
  text: string;
  condition: Condition | null;
  actions: ActionNode[];
  target: string | null;
}

export interface JumpNode {
  kind: "jump";
  target: string;
}

export interface ReturnNode {
  kind: "return";
}

export interface ActionNode {
  kind: "action";
  type: ActionType;
  target: string;
  value?: string;
  args?: string[];
}

export type ActionType =
  // State mutations
  | "give"
  | "remove"
  | "set"
  | "add_flag"
  | "del_flag"
  // Sprite/Layer system
  | "show"          // [show Aria center with dissolve]
  | "hide"          // [hide Aria with fade]
  | "move"          // [move Aria right 0.5]
  // Transitions
  | "transition"    // [transition fade 0.8]
  // Audio
  | "bgm"           // [bgm play track.ogg] [bgm stop] [bgm crossfade track2.ogg 1.0]
  | "se"            // [se play click.ogg]
  | "voice"         // [voice play aria_001.ogg]
  // Visual effects
  | "sfx"
  | "shake"
  | "flash"         // [flash 0.3 #ff0000]
  // Scene/flow
  | "call"          // [call logic.check_endings]
  | "bg"
  | "music"         // legacy alias for bgm
  // Wait variants
  | "wait";         // [wait], [wait 1.5], [wait click], [wait transition]

export interface WaitNode {
  kind: "wait";
  waitType?: 'click' | 'time' | 'transition' | 'animation';
  duration?: number;
}

export interface LabelNode {
  kind: "label";
  name: string;
}

export interface ConditionalBranch {
  condition: Condition | null;  // null for else
  body: ASTNode[];
}

export interface ConditionalNode {
  kind: "conditional";
  branches: ConditionalBranch[];
}

// ──────────────────────────────────────────────
// Conditions
// ──────────────────────────────────────────────

export type Condition =
  | BinaryCondition
  | FlagCondition
  | NotCondition
  | AndCondition
  | OrCondition
  | HasItemCondition
  | ChoiceSelectedCondition;

export interface BinaryCondition {
  kind: "binary";
  left: string;
  op: ">=" | ">" | "<=" | "<" | "=" | "!=";
  right: string | number | boolean;
}

export interface FlagCondition {
  kind: "has_flag";
  flag: string;
}

export interface HasItemCondition {
  kind: "has_item";
  item: string;
}

export interface ChoiceSelectedCondition {
  kind: "choice_selected";
  choiceId: string;           // track which choices player has made
}

export interface NotCondition {
  kind: "not";
  inner: Condition;
}

export interface AndCondition {
  kind: "and";
  left: Condition;
  right: Condition;
}

export interface OrCondition {
  kind: "or";
  left: Condition;
  right: Condition;
}

// ──────────────────────────────────────────────
// Scene
// ──────────────────────────────────────────────

export interface SceneDef {
  name: string;
  bg: string;
  music: string;
  transition: string;
  body: ASTNode[];
}

// ──────────────────────────────────────────────
// Logic
// ──────────────────────────────────────────────

export interface LogicDef {
  name: string;
  body: ASTNode[];
}

// ──────────────────────────────────────────────
// Full AST
// ──────────────────────────────────────────────

export interface KniAST {
  config: KniConfig | null;
  define: DefineBlock | null;
  scenes: Record<string, SceneDef>;
  logic: Record<string, LogicDef>;
}

// ──────────────────────────────────────────────
// Runtime Events (Renderer-facing)
// ──────────────────────────────────────────────

export type RuntimeEvent =
  // Text
  | { kind: "DIALOG"; char: string; charName: string; text: string; segments: TextSegment[]; modifiers: Modifier[]; portrait: string; color: string; voice?: string }
  | { kind: "NARRATION"; text: string; segments: TextSegment[]; modifiers: Modifier[] }
  // Interaction
  | { kind: "CHOICE"; prompt: string | null; options: { text: string; enabled: boolean; selected?: boolean }[]; timed?: number }
  // Layer/Sprite
  | { kind: "SHOW"; target: string; position: SpritePosition; transition: TransitionDef; layer?: string; expression?: string }
  | { kind: "HIDE"; target: string; transition: TransitionDef }
  | { kind: "MOVE"; target: string; position: SpritePosition; duration: number }
  // Scene
  | { kind: "TRANSITION"; transition: TransitionDef }
  | { kind: "BG"; target: string; transition: TransitionDef }
  | { kind: "JUMP"; target: string }
  // Audio
  | { kind: "AUDIO"; channel: AudioChannel; action: AudioAction; target?: string; duration?: number; volume?: number }
  // Effects
  | { kind: "ACTION"; type: ActionType; target: string; value?: string; args?: string[] }
  | { kind: "SHAKE"; target: string; duration: number; intensity?: number }
  | { kind: "FLASH"; duration: number; color?: string }
  // Wait
  | { kind: "WAIT"; waitType?: 'click' | 'time' | 'transition' | 'animation'; duration?: number }
  // Flow
  | { kind: "END" }
  | { kind: "ERROR"; message: string };
