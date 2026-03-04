export interface AuthPort {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (
    password: string,
    hashedPassword: string
  ) => Promise<boolean>;
  generateToken: (
    userId: string,
    email: string,
    role: string
  ) => Promise<string>;
  generateRefreshToken: (userId: string) => Promise<string>;
  verifyToken: (
    token: string
  ) => Promise<{ userId: string; email: string; role: string }>;
  verifyRefreshToken: (token: string) => Promise<{ userId: string }>;
  invalidateToken: (token: string) => Promise<void>;
  generatePasswordResetToken: (userId: string) => Promise<string>;
  verifyPasswordResetToken: (token: string) => Promise<{ userId: string }>;
}
