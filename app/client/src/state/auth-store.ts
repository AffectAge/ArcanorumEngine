import { create } from 'zustand';
import type { AuthProfile, LoginInput, RegistrationInput } from '@arcanorum/shared';
import * as authApi from '../api/auth-api.js';
import { AuthApiError } from '../api/auth-api.js';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  readonly status: AuthStatus;
  readonly player: AuthProfile | undefined;
  initialize: () => Promise<void>;
  register: (input: RegistrationInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  player: undefined,
  initialize: async () => {
    try {
      const player = await authApi.getCurrentPlayer();
      set({ status: 'authenticated', player });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'UNAUTHENTICATED') {
        set({ status: 'unauthenticated', player: undefined });
        return;
      }
      set({ status: 'unauthenticated', player: undefined });
    }
  },
  register: async (input) => {
    const player = await authApi.register(input);
    set({ status: 'authenticated', player });
  },
  login: async (input) => {
    const player = await authApi.login(input);
    set({ status: 'authenticated', player });
  },
  logout: async () => {
    await authApi.logout();
    set({ status: 'unauthenticated', player: undefined });
  },
  logoutAll: async () => {
    await authApi.logoutAll();
    set({ status: 'unauthenticated', player: undefined });
  },
}));
