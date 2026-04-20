"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const authError = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    await signIn("google", { callbackUrl });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary mx-auto mb-3 flex items-center justify-center">
            <span className="text-primary-foreground text-lg font-bold">P</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">PDP Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление ассессментами и планами развития
          </p>
        </div>

        <Card className="border-border/60 shadow-sm">
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
            <Button
              type="button"
              className="w-full h-10"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              {loading ? "Перенаправление..." : "Войти через Google"}
            </Button>
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
