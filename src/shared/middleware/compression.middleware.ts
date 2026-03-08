import { Request, Response, NextFunction } from "express";
import { gunzipSync, brotliDecompressSync } from "zlib";
import { logger } from "../logger";

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  savings: number;
  savingsPercent: number;
}

export function compressionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentEncoding = req.headers["content-encoding"];

  if (!contentEncoding) {
    return next();
  }

  // Only process chunk upload endpoints
  if (!req.path.includes("/chunks/")) {
    return next();
  }

  const chunks: Buffer[] = [];
  let originalSize = 0;

  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    originalSize += chunk.length;
  });

  req.on("end", () => {
    try {
      const compressedBuffer = Buffer.concat(chunks);
      let decompressedBuffer: Buffer;

      // Decompress based on encoding
      if (contentEncoding === "gzip") {
        decompressedBuffer = gunzipSync(compressedBuffer);
      } else if (contentEncoding === "br" || contentEncoding === "brotli") {
        decompressedBuffer = brotliDecompressSync(compressedBuffer);
      } else {
        logger.warn({
          message: "Unsupported content encoding",
          encoding: contentEncoding,
        });
        return next();
      }

      const decompressedSize = decompressedBuffer.length;
      const savings = decompressedSize - originalSize;
      const savingsPercent = (savings / decompressedSize) * 100;

      // Store compression stats in request for logging
      (req as any).compressionStats = {
        originalSize: decompressedSize,
        compressedSize: originalSize,
        savings,
        savingsPercent,
      };

      logger.debug({
        message: "Decompressed chunk",
        encoding: contentEncoding,
        originalSize: decompressedSize,
        compressedSize: originalSize,
        savingsPercent: savingsPercent.toFixed(2),
      });

      // Replace request body with decompressed data
      (req as any).rawBody = decompressedBuffer;

      next();
    } catch (error) {
      logger.error({
        message: "Failed to decompress request",
        error,
        encoding: contentEncoding,
      });
      res.status(400).json({
        error: "DECOMPRESSION_FAILED",
        message: "Failed to decompress request body",
      });
    }
  });

  req.on("error", (error) => {
    logger.error({ message: "Request stream error", error });
    next(error);
  });
}

export function getCompressionStats(req: Request): CompressionStats | null {
  return (req as any).compressionStats || null;
}
