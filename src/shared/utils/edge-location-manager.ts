import { logger } from "../logger";

export interface EdgeLocation {
  id: string;
  region: string;
  endpoint: string;
  priority: number;
  available: boolean;
  lastChecked?: Date;
}

export class EdgeLocationManager {
  private locations: Map<string, EdgeLocation> = new Map();
  private unavailableLocations: Set<string> = new Set();
  private checkInterval: number = 60000; // 1 minute

  constructor() {
    this.initializeLocations();
  }

  private initializeLocations(): void {
    // Define edge locations by region
    const defaultLocations: EdgeLocation[] = [
      {
        id: "us-east-1",
        region: "us-east",
        endpoint: "s3-accelerate.amazonaws.com",
        priority: 1,
        available: true,
      },
      {
        id: "us-west-1",
        region: "us-west",
        endpoint: "s3-accelerate.amazonaws.com",
        priority: 2,
        available: true,
      },
      {
        id: "eu-west-1",
        region: "eu-west",
        endpoint: "s3-accelerate.amazonaws.com",
        priority: 1,
        available: true,
      },
      {
        id: "ap-southeast-1",
        region: "ap-southeast",
        endpoint: "s3-accelerate.amazonaws.com",
        priority: 1,
        available: true,
      },
    ];

    defaultLocations.forEach((location) => {
      this.locations.set(location.id, location);
    });

    logger.info({
      message: "Initialized edge locations",
      count: this.locations.size,
      locations: Array.from(this.locations.keys()),
    });
  }

  getAvailableLocation(preferredRegion?: string): EdgeLocation | null {
    // Try preferred region first
    if (preferredRegion) {
      const preferred = this.findLocationByRegion(preferredRegion);
      if (
        preferred &&
        preferred.available &&
        !this.unavailableLocations.has(preferred.id)
      ) {
        return preferred;
      }
    }

    // Find next available location by priority
    const availableLocations = Array.from(this.locations.values())
      .filter((loc) => loc.available && !this.unavailableLocations.has(loc.id))
      .sort((a, b) => a.priority - b.priority);

    if (availableLocations.length === 0) {
      logger.error("No available edge locations");
      return null;
    }

    return availableLocations[0] || null;
  }

  markLocationUnavailable(locationId: string): void {
    this.unavailableLocations.add(locationId);
    const location = this.locations.get(locationId);

    if (location) {
      location.available = false;
      location.lastChecked = new Date();

      logger.warn({
        message: "Marked edge location as unavailable",
        locationId,
        region: location.region,
      });

      // Schedule re-check after interval
      setTimeout(() => {
        this.checkLocationAvailability(locationId);
      }, this.checkInterval);
    }
  }

  private async checkLocationAvailability(locationId: string): Promise<void> {
    const location = this.locations.get(locationId);
    if (!location) return;

    try {
      // In production, this would perform an actual health check
      // For now, we'll just mark it as available again
      location.available = true;
      location.lastChecked = new Date();
      this.unavailableLocations.delete(locationId);

      logger.info({
        message: "Edge location is available again",
        locationId,
        region: location.region,
      });
    } catch (error) {
      logger.error({
        message: "Edge location still unavailable",
        error,
        locationId,
        region: location.region,
      });

      // Schedule another check
      setTimeout(() => {
        this.checkLocationAvailability(locationId);
      }, this.checkInterval);
    }
  }

  private findLocationByRegion(region: string): EdgeLocation | undefined {
    return Array.from(this.locations.values()).find(
      (loc) => loc.region === region
    );
  }

  getLocationStatus(): Array<{
    id: string;
    region: string;
    available: boolean;
  }> {
    return Array.from(this.locations.values()).map((loc) => ({
      id: loc.id,
      region: loc.region,
      available: loc.available && !this.unavailableLocations.has(loc.id),
    }));
  }

  selectFailoverLocation(
    failedLocationId: string,
    preferredRegion?: string
  ): EdgeLocation | null {
    logger.info({
      message: "Selecting failover location",
      failedLocationId,
      preferredRegion,
    });

    // Mark failed location as unavailable
    this.markLocationUnavailable(failedLocationId);

    // Get next available location
    const failoverLocation = this.getAvailableLocation(preferredRegion);

    if (failoverLocation) {
      logger.info({
        message: "Selected failover location",
        locationId: failoverLocation.id,
        region: failoverLocation.region,
      });
    }

    return failoverLocation;
  }
}

// Singleton instance
export const edgeLocationManager = new EdgeLocationManager();
