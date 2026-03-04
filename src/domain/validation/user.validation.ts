import { UserRole } from "../types/user.types.js";

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 8 && password.length <= 100;
};

export const isValidUserRole = (role: string): role is UserRole => {
  return ["STUDENT", "INSTRUCTOR", "ADMIN"].includes(role);
};

export const isValidName = (name: string): boolean => {
  return name.length >= 2 && name.length <= 255;
};

export const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  if (!isValidEmail(email)) return "Invalid email format";
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 100) return "Password must not exceed 100 characters";
  return null;
};

export const validateName = (name: string): string | null => {
  if (!name) return "Name is required";
  if (name.length < 2) return "Name must be at least 2 characters";
  if (name.length > 255) return "Name must not exceed 255 characters";
  return null;
};

export const validateUserRole = (role: string): string | null => {
  if (!role) return "Role is required";
  if (!isValidUserRole(role)) return "Invalid user role";
  return null;
};
