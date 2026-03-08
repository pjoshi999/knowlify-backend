import { SessionStatus } from "../../domain/models/upload-session.model";

export class SessionStatusValidator {
  private static readonly VALID_TRANSITIONS: Map<
    SessionStatus,
    SessionStatus[]
  > = new Map([
    ["pending", ["uploading", "cancelled"]],
    ["uploading", ["processing", "failed", "cancelled"]],
    ["processing", ["completed", "failed"]],
    ["completed", []],
    ["failed", []],
    ["cancelled", []],
  ]);

  /**
   * Check if a status transition is valid
   */
  static isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
    const allowedTransitions = this.VALID_TRANSITIONS.get(from);

    if (!allowedTransitions) {
      return false;
    }

    return allowedTransitions.includes(to);
  }

  /**
   * Get allowed transitions for a given status
   */
  static getAllowedTransitions(from: SessionStatus): SessionStatus[] {
    return this.VALID_TRANSITIONS.get(from) || [];
  }

  /**
   * Validate and throw error if transition is invalid
   */
  static validateTransition(from: SessionStatus, to: SessionStatus): void {
    if (!this.isValidTransition(from, to)) {
      throw new Error(
        `Invalid status transition from '${from}' to '${to}'. ` +
          `Allowed transitions: ${this.getAllowedTransitions(from).join(", ") || "none"}`
      );
    }
  }

  /**
   * Check if a status is terminal (no further transitions allowed)
   */
  static isTerminalStatus(status: SessionStatus): boolean {
    const allowedTransitions = this.VALID_TRANSITIONS.get(status);
    return !allowedTransitions || allowedTransitions.length === 0;
  }

  /**
   * Get all terminal statuses
   */
  static getTerminalStatuses(): SessionStatus[] {
    return Array.from(this.VALID_TRANSITIONS.entries())
      .filter(([_, transitions]) => transitions.length === 0)
      .map(([status, _]) => status);
  }
}
