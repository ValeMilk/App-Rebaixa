"use client";

import { create } from "zustand";
import api from "./api";

export const useAuth = create((set) => ({
  user: null,
  token: null,
  loading: true,

  init: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    set({
      token,
      user: userStr ? JSON.parse(userStr) : null,
      loading: false,
    });
  },

  login: async (email, senha) => {
    const { data } = await api.post("/auth/login", { email, senha });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
    return data.user;
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null });
    if (typeof window !== "undefined") window.location.href = "/login";
  },
}));
