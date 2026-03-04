import { AuthPort } from "../../ports/auth.port.js";

export const createLogoutUseCase = (authService: AuthPort) => {
  return async (token: string): Promise<void> => {
    await authService.invalidateToken(token);
  };
};
