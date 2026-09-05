export interface EngineStatus {
  root: string;
  present: boolean;
  overworld: string;
  packs: string[];
}
export function engineRoot(): string;
export function engineStatus(): EngineStatus;
export interface EngineLink extends EngineStatus {
  linked: boolean;
  adapter: string;
}
export function engineLinked(): EngineLink;
