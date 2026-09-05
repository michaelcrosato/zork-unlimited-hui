export interface EngineStatus {
  root: string;
  present: boolean;
  overworld: string;
  packs: string[];
}
export function engineRoot(): string;
export function engineStatus(): EngineStatus;
