// ── kNi DSL Type System ──

// ---- Config ----
export interface KniConfig {
  title: string;
  author: string;
  version: number;
  start: string; // e.g. "scene.intro"
  lang: string;
}

// ---- Characters ----
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

// ---- Items ----
export interface ItemDef {
  name: string;
  desc: string;
  icon: string;
  stackable: boolean;
  tags: string[];
}

// ---- Variables ----
export interface VarDef {
  [name: string]: number | string | boolean | string[];
}

// ---- Define block ----
export interface DefineBlock {
  chars: Record<string, CharDef>;
  items: Record<string, ItemDef>;
  vars: VarDef;
}

// ---- Performance modifiers ----
export interface Modifier {
  type: string; // shake, flash, whisper, delay, etc.
  args: string[];
}

// ---- AST Nodes ----

export type ASTNode =
  | DialogNode
  | NarrationNode
  | ChoiceNode
  | OptionNode
  | JumpNode
  | ActionNode
  | WaitNode
  | LabelNode
  | ConditionalNode;

export interface DialogNode {
  kind: "dialog";
  char: string;
  text: string;
  modifiers: Modifier[];
}

export interface NarrationNode {
  kind: "narration";
  text: string;
  modifiers: Modifier[];
}

export interface ChoiceNode {
  kind: "choice";
  prompt: string | null;
  options: OptionNode[];
}

export interface OptionNode {
  kind: "option";
  text: string;
  condition: Condition | null;
  actions: ActionNode[];
  target: string | null; // scene name or null
}

export interface JumpNode {
  kind: "jump";
  target: string; // scene name
}

export interface ActionNode {
  kind: "action";
  type: ActionType;
  target: string; // e.g. "Aria.stats.trust", "item.keycard", "ending"
  value?: string; // for set, the new value
  args?: string[]; // for sfx, shake, etc.
}

export type ActionType =
  | "give"
  | "remove"
  | "set"
  | "add_flag"
  | "del_flag"
  | "sfx"
  | "shake"
  | "call"
  | "bg"
  | "music"
  | "wait";

export interface WaitNode {
  kind: "wait"; // ---
}

export interface LabelNode {
  kind: "label";
  name: string;
}

export interface ConditionalBranch {
  condition: Condition | null; // null for else
  body: ASTNode[];
}

export interface ConditionalNode {
  kind: "conditional";
  branches: ConditionalBranch[];
}

// ---- Conditions ----
export type Condition =
  | BinaryCondition
  | FlagCondition
  | NotCondition
  | AndCondition
  | OrCondition;

export interface BinaryCondition {
  kind: "binary";
  left: string; // path like "Aria.stats.trust"
  op: ">=" | ">" | "<=" | "<" | "=" | "!=";
  right: string | number | boolean;
}

export interface FlagCondition {
  kind: "has_flag";
  flag: string;
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

// ---- Scene ----
export interface SceneDef {
  name: string;
  bg: string;
  music: string;
  transition: string;
  body: ASTNode[];
}

// ---- Logic ----
export interface LogicDef {
  name: string;
  body: ASTNode[];
}

// ---- Full AST ----
export interface KniAST {
  config: KniConfig | null;
  define: DefineBlock | null;
  scenes: Record<string, SceneDef>;
  logic: Record<string, LogicDef>;
}

// ---- Runtime Events (Renderer-facing) ----
export type RuntimeEvent =
  | { kind: "DIALOG"; char: string; charName: string; text: string; modifiers: Modifier[]; portrait: string; color: string }
  | { kind: "NARRATION"; text: string; modifiers: Modifier[] }
  | { kind: "CHOICE"; prompt: string | null; options: { text: string; enabled: boolean }[] }
  | { kind: "JUMP"; target: string }
  | { kind: "ACTION"; type: ActionType; target: string; value?: string; args?: string[] }
  | { kind: "WAIT" }
  | { kind: "END" }
  | { kind: "ERROR"; message: string };
