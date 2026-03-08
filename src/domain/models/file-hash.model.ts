export interface FileHash {
  hash: string;
  storageKey: string;
  referenceCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingKey?: string;
  referenceCreated: boolean;
}
