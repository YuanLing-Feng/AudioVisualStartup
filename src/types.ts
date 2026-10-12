export type Tool = 'select' | 'circle' | 'rect' | 'line';
export type ShapeKind = 'circle' | 'rect' | 'line';
export type Composition = 'none' | 'horizontal' | 'vertical' | 'grid' | 'radial' | 'path' | 'random';
export type PathKind = 'line' | 'circle' | 'bezier' | 'free';
export type Selection = { kind: 'shape' | 'group'; id: string };

export interface Shape {
  id: string; kind: ShapeKind; name: string; x: number; y: number; width: number; height: number;
  scaleX: number; scaleY: number; lockAspectRatio: boolean; rotation: number;
  fill: string; fillOpacity: number; stroke: string; strokeWidth: number; strokeOpacity: number;
  groupId?: string; hidden?: boolean; instance?: boolean; path?: PathDef; created: number;
}
export interface Group {
  id: string; name: string; memberIds: string[]; composition: Composition; count: number; spacing: number;
  radius: number; columns: number; offset: number; reverse: boolean; perspective: boolean; perspectiveStrength: number;
  seed: number; path?: PathDef; hidden?: boolean;
}
export interface PathDef {
  kind: PathKind; x: number; y: number; length: number; radius: number; offset: number; orientation: boolean;
  angleOffset: number; loop: boolean;
}
export type SourceId = 'pitch' | 'velocity' | 'duration' | 'pan' | 'event' | 'spectrum' | 'volume' | 'volumeSequence' | 'low' | 'mid' | 'high' | 'envelope';
export interface Mapping {
  id: string; source: SourceId; targetKind: 'shape' | 'group' | 'path' | 'members'; targetId: string;
  property: string; inputMin?: number; inputMax?: number; min: number; max: number; enabled: boolean; reverse: boolean; smooth: boolean;
  sampling: 'average' | 'peak' | 'linear'; colorA?: string; colorB?: string; sourceTrack?: string;
}
export interface AppState { shapes: Shape[]; groups: Group[]; mappings: Mapping[]; }
