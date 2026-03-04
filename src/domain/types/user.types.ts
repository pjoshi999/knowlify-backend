export type UserRole = "STUDENT" | "INSTRUCTOR" | "ADMIN";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface UserWithPassword extends User {
  password: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
  name: string;
}

export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string;
  bio?: string;
  password?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  avatarUrl?: string;
  bio?: string;
}

export interface AuthSession {
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetCompletion {
  token: string;
  newPassword: string;
}
