export interface ActionProvider {
  readonly id: string;
  readonly kind: 'bot' | 'mock' | 'local' | 'harness' | 'api';
}

export {
  ACTION_PROMPT_TEMPLATE_VERSION,
  actionPromptDryRunObservations,
  renderActionPrompt,
} from './action-prompt.js';
