export type Tool = 'select' | 'circle' | 'rect' | 'line';
export type ShapeKind = 'circle' | 'rect' | 'line';
export type Composition = 'none' | 'horizontal' | 'vertical' | 'grid' | 'radial' | 'path' | 'random';
export type PathKind = 'line' | 'circle' | 'bezier' | 'free';
export type FieldKind = 'directional' | 'attract' | 'repel';
export type Selection = { kind: 'shape' | 'group' | 'field'; id: string };

export interface Shape {
  id: string; kind: ShapeKind; name: string; x: number; y: number; width: number; height: number;
  rotation: number; fill: string; opacity: number; stroke?: string; groupId?: string; hidden?: boolean; instance?: boolean;
  created: number;
}
export interface Group {
  id: string; name: string; memberIds: string[]; composition: Composition; count: number; spacing: number;
  radius: number; columns: number; offset: number; reverse: boolean; perspective: boolean; perspectiveStrength: number;
  seed: number; path?: PathDef;
}
export interface PathDef {
  kind: PathKind; x: number; y: number; length: number; radius: number; offset: number; orientation: boolean;
  angleOffset: number; loop: boolean;
}
export interface Field {
  id: string; name: string; kind: FieldKind; x: number; y: number; radius: number; strength: number; direction: number;
  falloff: 'uniform' | 'radial';
}
export type SourceId = 'pitch' | 'velocity' | 'duration' | 'pan' | 'event' | 'spectrum';
export interface Mapping {
  id: string; source: SourceId; targetKind: 'shape' | 'group' | 'path' | 'field' | 'members'; targetId: string;
  property: string; base: number; min: number; max: number; enabled: boolean; reverse: boolean;
  sampling: 'average' | 'peak' | 'linear'; colorA?: string; colorB?: string;
}
export interface AppState { shapes: Shape[]; groups: Group[]; fields: Field[]; mappings: Mapping[]; }
