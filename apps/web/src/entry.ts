import { bootReplayViewerFromDocument } from './main.js';

declare const document: { getElementById(id: string): unknown } | undefined;

if (typeof document !== 'undefined') {
  bootReplayViewerFromDocument(document);
}
