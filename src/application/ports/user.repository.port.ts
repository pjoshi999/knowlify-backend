import {
  User,
  CreateUserInput,
  UpdateUserInput,
} from "../../domain/types/user.types.js";

export interface UserRepositoryPort {
  findById: (id: string) => Promise<User | null>;
  findByEmail: (email: string) => Promise<User | null>;
  create: (
    input: CreateUserInput & { hashedPassword: string }
  ) => Promise<User>;
  update: (id: string, input: UpdateUserInput) => Promise<User>;
  delete: (id: string) => Promise<void>;
  exists: (email: string) => Promise<boolean>;
}
