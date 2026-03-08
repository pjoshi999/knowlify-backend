import { gzipSync, gunzipSync } from "zlib";
import { logger } from "../logger";

export class CompressionUtil {
  /**
   * Compress metadata using gzip
   */
  static compressMetadata(data: Record<string, any>): Buffer {
    try {
      const jsonString = JSON.stringify(data);
      const compressed = gzipSync(jsonString);

      logger.debug({
        message: "Compressed metadata",
        originalSize: jsonString.length,
        compressedSize: compressed.length,
        ratio: ((compressed.length / jsonString.length) * 100).toFixed(2) + "%",
      });

      return compressed;
    } catch (error) {
      logger.error({ message: "Failed to compress metadata", error });
      throw new Error("Metadata compression failed");
    }
  }

  /**
   * Decompress metadata from gzip
   */
  static decompressMetadata(buffer: Buffer): Record<string, any> {
    try {
      const decompressed = gunzipSync(buffer);
      const jsonString = decompressed.toString("utf-8");
      const data = JSON.parse(jsonString);

      logger.debug({
        message: "Decompressed metadata",
        compressedSize: buffer.length,
        decompressedSize: jsonString.length,
      });

      return data;
    } catch (error) {
      logger.error({ message: "Failed to decompress metadata", error });
      throw new Error("Metadata decompression failed");
    }
  }

  /**
   * Check if compression would be beneficial
   */
  static shouldCompress(
    data: Record<string, any>,
    threshold: number = 1024
  ): boolean {
    const jsonString = JSON.stringify(data);
    return jsonString.length > threshold;
  }

  /**
   * Compress if beneficial, otherwise return original
   */
  static compressIfBeneficial(
    data: Record<string, any>,
    threshold: number = 1024
  ): { compressed: boolean; data: Buffer | string } {
    if (this.shouldCompress(data, threshold)) {
      return {
        compressed: true,
        data: this.compressMetadata(data),
      };
    }

    return {
      compressed: false,
      data: JSON.stringify(data),
    };
  }
}
