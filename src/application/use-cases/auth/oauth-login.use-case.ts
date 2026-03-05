import { AuthSession } from "../../../domain/types/user.types.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";
import {
  verifySupabaseToken,
  SupabaseUser,
} from "../../../infrastructure/auth/supabase.service.js";

export interface OAuthLoginInput {
  accessToken: string;
  provider: "google" | "github";
}

export const createOAuthLoginUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (input: OAuthLoginInput): Promise<AuthSession> => {
    const supabaseUser = await verifySupabaseToken(input.accessToken);

    if (!supabaseUser?.email) {
      throw new Error("Invalid OAuth token");
    }

    let user = await userRepository.findByEmail(supabaseUser.email);

    if (!user) {
      const name = extractName(supabaseUser);
      const avatarUrl = extractAvatarUrl(supabaseUser);

      const randomPassword = await authService.hashPassword(
        Math.random().toString(36)
      );

      user = await userRepository.create({
        email: supabaseUser.email,
        password: "",
        name,
        role: "STUDENT",
        hashedPassword: randomPassword,
      });

      if (avatarUrl) {
        await userRepository.update(user.id, { avatarUrl });
      }
    }

    const accessToken = await authService.generateToken(
      user.id,
      user.email,
      user.role
    );
    const refreshToken = await authService.generateRefreshToken(user.id);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    return {
      userId: user.id,
      accessToken,
      refreshToken,
      expiresAt,
    };
  };
};

const extractName = (supabaseUser: SupabaseUser): string => {
  return (
    supabaseUser.user_metadata.name ??
    supabaseUser.user_metadata.full_name ??
    supabaseUser.email?.split("@")[0] ??
    "User"
  );
};

const extractAvatarUrl = (supabaseUser: SupabaseUser): string | undefined => {
  return (
    supabaseUser.user_metadata.avatar_url ?? supabaseUser.user_metadata.picture
  );
};
