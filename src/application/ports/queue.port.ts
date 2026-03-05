export interface JobData {
  [key: string]: unknown;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export interface JobStatus {
  id: string;
  state: "waiting" | "active" | "completed" | "failed" | "delayed";
  progress?: number;
  result?: unknown;
  error?: string;
  attemptsMade?: number;
  timestamp?: number;
}

export interface QueuePort {
  addJob: (
    queueName: string,
    jobName: string,
    data: JobData,
    options?: JobOptions
  ) => Promise<string>;
  getJobStatus: (queueName: string, jobId: string) => Promise<JobStatus | null>;
  removeJob: (queueName: string, jobId: string) => Promise<void>;
  getJobResult: (queueName: string, jobId: string) => Promise<unknown>;
}
