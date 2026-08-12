export interface Comment {
	id: string;
	quote: string;
	comment: string;
	createdAt: number;
	lineStart?: number;
	lineEnd?: number;
}

export class CommentStore {
	private readonly byUri = new Map<string, Comment[]>();

	add(uri: string, id: string, quote: string, comment: string, lineStart?: number, lineEnd?: number): Comment {
		const entry: Comment = {
			id,
			quote,
			comment,
			createdAt: Date.now(),
			lineStart,
			lineEnd,
		};
		const list = this.byUri.get(uri) ?? [];
		list.push(entry);
		this.byUri.set(uri, list);
		return entry;
	}

	remove(uri: string, id: string): void {
		const list = this.byUri.get(uri);
		if (!list) {
			return;
		}
		this.byUri.set(uri, list.filter((entry) => entry.id !== id));
	}

	update(uri: string, id: string, comment: string): void {
		const entry = this.byUri.get(uri)?.find((item) => item.id === id);
		if (entry) {
			entry.comment = comment;
		}
	}

	clear(uri: string): void {
		this.byUri.delete(uri);
	}

	list(uri: string): Comment[] {
		return this.byUri.get(uri) ?? [];
	}
}
