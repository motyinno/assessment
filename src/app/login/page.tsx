"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const devLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const authError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@test.dev");
  const [password, setPassword] = useState("dev");

  async function handleGoogleSignIn() {
    setLoading(true);
    await signIn("google", { callbackUrl });
  }

  async function handleDevSignIn(e: React.FormEvent) {
    e.preventDefault();
    setDevError(null);
    setDevLoading(true);
    const res = await signIn("dev-credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setDevLoading(false);
    if (res?.error) {
      setDevError("Неверный email или пароль");
      return;
    }
    window.location.href = res?.url || callbackUrl;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-muted/30 p-6">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, oklch(0.90 0.08 25 / 0.55) 0%, transparent 60%), radial-gradient(55% 45% at 80% 90%, oklch(0.92 0.05 50 / 0.5) 0%, transparent 60%)",
        }}
      />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 mx-auto mb-4 flex items-center justify-center shadow-lg ring-1 ring-primary/20">
            <span className="text-primary-foreground text-xl font-bold tracking-wider">PDP</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">PDP Generator</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Управление ассессментами и планами развития
          </p>
        </div>

        <Card className="border-border/60 shadow-xl shadow-foreground/5">
          <CardHeader className="pb-4 pt-6 px-6">
            <h2 className="text-base font-semibold text-center">Вход в систему</h2>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Войдите с помощью корпоративного аккаунта Google (@innowise.com).
            </p>
            {authError && (
              <p className="text-sm text-destructive text-center">
                Доступ разрешён только для корпоративных аккаунтов Innowise.
              </p>
            )}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-10 inline-flex items-center justify-center gap-3 rounded-md border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] shadow-sm transition hover:bg-[#f8f9fa] active:bg-[#f1f3f4] disabled:opacity-60 disabled:cursor-not-allowed font-['Roboto',_'Arial',_sans-serif]"
              aria-label="Sign in with Google"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#4285F4"
                  d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9086c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
                />
              </svg>
              {loading ? "Перенаправление..." : "Sign in with Google"}
            </button>

            {devLoginEnabled && (
              <>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground uppercase">
                      Dev login
                    </span>
                  </div>
                </div>
                <form onSubmit={handleDevSignIn} className="space-y-2">
                  <input
                    type="email"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {devError && (
                    <p className="text-xs text-destructive">{devError}</p>
                  )}
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full h-9"
                    disabled={devLoading}
                  >
                    {devLoading ? "Вход..." : "Войти (dev)"}
                  </Button>
                </form>
                <p className="text-[11px] text-muted-foreground text-center leading-snug">
                  admin@test.dev · assessor@test.dev · user-jun@test.dev · user-mid@test.dev — пароль: dev
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
