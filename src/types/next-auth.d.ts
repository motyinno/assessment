import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      grade: string | null;
      project: string | null;
      managerId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    grade?: string | null;
    project?: string | null;
    managerId?: string | null;
  }
}
