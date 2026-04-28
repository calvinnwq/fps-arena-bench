export interface ActionProvider {
  readonly id: string;
  readonly kind: 'bot' | 'mock' | 'local' | 'harness' | 'api';
}
