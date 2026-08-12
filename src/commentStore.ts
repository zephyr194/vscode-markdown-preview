export interface Comment {
	id: string;
	quote: string;
	comment: string;
	createdAt: number;
}

export class CommentStore {
	private readonly byUri = new Map<string, Comment[]>();

	add(uri: string, id: string, quote: string, comment: string): Comment {
		const entry: Comment = {
			id,
			quote,
			comment,
			createdAt: Date.now(),
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

	clear(uri: string): void {
		this.byUri.delete(uri);
	}

	list(uri: string): Comment[] {
		return this.byUri.get(uri) ?? [];
	}
}
