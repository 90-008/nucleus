import type { CanonicalResourceUri, RecordKey } from '@atcute/lexicons';
import type { BacklinksSource } from './constellation';

export type Notification = {
	kind: 'link';
	origin: string;
	link: LinkNotification;
};

export type LinkNotification = {
	operation: 'create'; // todo: delete in the future
	source: BacklinksSource;
	source_record: CanonicalResourceUri;
	source_rev: RecordKey;
	subject: CanonicalResourceUri;
};
