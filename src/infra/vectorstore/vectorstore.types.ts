export interface VectorDocument {
    id?: string;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    createdAt?: Date;
}

export interface SearchResult {
    content: string;
    metadata: Record<string, unknown>;
    score: number;
}

export interface RawQueryResult {
    content: string;
    metadata: Record<string, unknown>;
    score: number | string;
}
