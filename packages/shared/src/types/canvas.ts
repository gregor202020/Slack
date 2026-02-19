export interface Canvas {
  id: string;
  channelId: string;
  sizeBytes: number;
  locked: boolean;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasVersion {
  id: string;
  canvasId: string;
  yjsSnapshot: Buffer | Uint8Array;
  createdAt: string;
}
