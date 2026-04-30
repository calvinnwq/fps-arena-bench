import type { Action, AdapterMetadata, Observation } from '@fps-arena-bench/schemas';

export interface ActionRequest {
  readonly observation: Observation;
  readonly contenderId: string;
  readonly tick: number;
  readonly signal?: AbortSignal;
}

export interface ActionProvider {
  readonly metadata: AdapterMetadata;
  decide(request: ActionRequest): Promise<Action> | Action;
}

export {
  ACTION_PROMPT_TEMPLATE_VERSION,
  actionPromptDryRunObservations,
  renderActionPrompt,
} from './action-prompt.js';
